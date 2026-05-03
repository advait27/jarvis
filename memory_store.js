// Sensory memory store (Phase 4).
// Persists observations as JSONL with embeddings and provides cosine retrieval.
//
// Entry shape:
//   { id, ts, type, text, vector, meta? }
// Types we use today: 'vision-query', 'screen-watch', 'ambient', 'conversation'.
//
// Volume estimate: a busy hour ~ 200 entries × 2048 floats × 8 bytes ≈ 3 MB.
// In-memory linear scan is plenty fast at this scale; we'll graduate to ANN later.

const fs = require('fs');
const path = require('path');
const nim = require('./nim_client');

let _file = null;
let _entries = [];     // in-memory cache of all entries (with vectors)
let _ready = false;
let _writeQueue = Promise.resolve();
const MAX_ENTRIES = 5000; // hard cap so the cache stays bounded
const TIME_DECAY_HALFLIFE_MIN = 60; // recent memories rank a bit higher

function init(userDataDir) {
  _file = path.join(userDataDir, 'jarvis-memory.jsonl');
  _entries = [];
  if (fs.existsSync(_file)) {
    const raw = fs.readFileSync(_file, 'utf8');
    for (const line of raw.split('\n')) {
      if (!line.trim()) continue;
      try {
        const e = JSON.parse(line);
        if (e && Array.isArray(e.vector)) _entries.push(e);
      } catch (_) { /* skip bad line */ }
    }
    if (_entries.length > MAX_ENTRIES) {
      _entries = _entries.slice(-MAX_ENTRIES);
      // Best-effort rewrite to trim file too.
      try { fs.writeFileSync(_file, _entries.map(e => JSON.stringify(e)).join('\n') + '\n'); } catch (_) {}
    }
  }
  _ready = true;
  console.log(`[Memory] Initialized at ${_file} with ${_entries.length} entries`);
  return { file: _file, count: _entries.length };
}

function _appendLine(entry) {
  _writeQueue = _writeQueue.then(() => new Promise((resolve) => {
    fs.appendFile(_file, JSON.stringify(entry) + '\n', () => resolve());
  }));
  return _writeQueue;
}

async function add({ type, text, meta }) {
  if (!_ready) throw new Error('memory not initialized');
  if (!text || typeof text !== 'string' || text.trim().length < 2) {
    return { success: false, error: 'empty text' };
  }
  const trimmed = text.trim().slice(0, 2000);
  let vectors;
  try {
    const emb = await nim.embed({ texts: [trimmed], inputType: 'passage' });
    vectors = emb.vectors;
  } catch (err) {
    return { success: false, error: `embed failed: ${err.message}` };
  }
  const entry = {
    id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ts: Date.now(),
    type: type || 'misc',
    text: trimmed,
    vector: vectors[0],
    meta: meta || null,
  };
  _entries.push(entry);
  if (_entries.length > MAX_ENTRIES) _entries.shift();
  await _appendLine(entry);
  return { success: true, id: entry.id, count: _entries.length };
}

function _cosine(a, b) {
  let dot = 0, na = 0, nb = 0;
  const len = Math.min(a.length, b.length);
  for (let i = 0; i < len; i++) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  if (na === 0 || nb === 0) return 0;
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

async function query({ query: queryText, k = 5, types, minScore = 0.1, sinceMs, relativeFloor = 0.5 }) {
  if (!_ready) throw new Error('memory not initialized');
  if (!queryText) return { success: false, error: 'empty query' };
  if (_entries.length === 0) return { success: true, hits: [] };

  let qvec;
  try {
    const emb = await nim.embed({ texts: [queryText], inputType: 'query' });
    qvec = emb.vectors[0];
  } catch (err) {
    return { success: false, error: `embed failed: ${err.message}` };
  }

  const now = Date.now();
  const halfLifeMs = TIME_DECAY_HALFLIFE_MIN * 60 * 1000;
  const candidates = _entries.filter(e => {
    if (types && types.length && !types.includes(e.type)) return false;
    if (sinceMs && e.ts < sinceMs) return false;
    return true;
  });

  const scored = candidates.map(e => {
    const sim = _cosine(qvec, e.vector);
    const ageMs = now - e.ts;
    const recencyBoost = Math.pow(0.5, ageMs / halfLifeMs) * 0.05; // up to +0.05
    return { entry: e, score: sim + recencyBoost, sim };
  });

  scored.sort((a, b) => b.score - a.score);
  // Relative floor: keep only hits that are at least `relativeFloor` × the top
  // similarity, so we don't drag in low-relevance entries when the top hit is itself weak.
  const topSim = scored[0]?.sim || 0;
  const dynamicFloor = Math.max(minScore, topSim * relativeFloor);
  const hits = scored
    .filter(s => s.sim >= dynamicFloor)
    .slice(0, k)
    .map(s => ({
      id: s.entry.id,
      ts: s.entry.ts,
      type: s.entry.type,
      text: s.entry.text,
      score: Number(s.score.toFixed(4)),
      sim: Number(s.sim.toFixed(4)),
      ageSec: Math.round((now - s.entry.ts) / 1000),
      meta: s.entry.meta,
    }));
  return { success: true, hits, candidates: candidates.length };
}

function stats() {
  const byType = {};
  for (const e of _entries) byType[e.type] = (byType[e.type] || 0) + 1;
  const oldest = _entries[0]?.ts || null;
  const newest = _entries[_entries.length - 1]?.ts || null;
  return { count: _entries.length, byType, oldestTs: oldest, newestTs: newest, file: _file };
}

function clear() {
  _entries = [];
  if (_file && fs.existsSync(_file)) fs.unlinkSync(_file);
  return { success: true };
}

module.exports = { init, add, query, stats, clear };
