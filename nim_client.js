// NVIDIA NIM client — OpenAI-compatible REST API.
// Free tier API catalog: https://build.nvidia.com
//
// Auth: Authorization: Bearer nvapi-...
// Endpoint: https://integrate.api.nvidia.com/v1/chat/completions
//
// Models we route to (overridable via env):
//   NIM_REASONING_MODEL — text brain (planner / conversation)
//   NIM_VISION_MODEL    — vision-language for screen/camera frames
//   NIM_OMNI_MODEL      — omni-modal fallback (image + audio + text)

const NIM_BASE = 'https://integrate.api.nvidia.com/v1';

const DEFAULTS = {
  reasoning: process.env.NIM_REASONING_MODEL || 'meta/llama-3.3-70b-instruct',
  vision:    process.env.NIM_VISION_MODEL    || 'nvidia/nemotron-nano-12b-v2-vl',
  omni:      process.env.NIM_OMNI_MODEL      || 'nvidia/nemotron-3-nano-omni-30b-a3b-reasoning',
  embed:     process.env.NIM_EMBED_MODEL     || 'nvidia/llama-3.2-nv-embedqa-1b-v2',
};

function getApiKey() {
  const k = process.env.NVIDIA_API_KEY;
  if (!k) throw new Error('NVIDIA_API_KEY not set in environment');
  return k;
}

async function nimChatCompletion({ model, messages, max_tokens = 1024, temperature = 0.4, stream = false, signal }) {
  const apiKey = getApiKey();
  const startMs = Date.now();
  const res = await fetch(`${NIM_BASE}/chat/completions`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      Accept: stream ? 'text/event-stream' : 'application/json',
    },
    body: JSON.stringify({ model, messages, max_tokens, temperature, stream }),
    signal,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    const isQuota = res.status === 429 || /quota|rate.?limit|credits/i.test(errText);
    const tag = isQuota ? 'NIM_LIMIT_EXHAUSTED' : `NIM_HTTP_${res.status}`;
    throw new Error(`${tag}: ${errText.slice(0, 240)}`);
  }

  const data = await res.json();
  const choice = data.choices?.[0];
  if (!choice) throw new Error('NIM_NO_CHOICES');
  // Reasoning-style Nemotron models can return empty content if max_tokens
  // ran out inside the chain-of-thought; surface reasoning_content as fallback.
  const msg = choice.message || {};
  const reply = msg.content || msg.reasoning_content || msg.reasoning || '';
  return {
    success: true,
    reply,
    finishReason: choice.finish_reason,
    model: data.model || model,
    latencyMs: Date.now() - startMs,
    usage: data.usage || null,
  };
}

async function chat({ messages, max_tokens, temperature, signal } = {}) {
  return nimChatCompletion({
    model: DEFAULTS.reasoning,
    messages,
    max_tokens,
    temperature,
    signal,
  });
}

// Vision call. `imageDataUrl` should be a `data:image/jpeg;base64,...` (or png) URL.
// `prompt` is the natural-language question about the image.
async function vision({ prompt, imageDataUrl, history = [], max_tokens = 1024, signal } = {}) {
  if (!imageDataUrl) throw new Error('vision() requires imageDataUrl');
  const userContent = [
    { type: 'text', text: prompt || 'Describe this image.' },
    { type: 'image_url', image_url: { url: imageDataUrl } },
  ];
  const messages = [...history, { role: 'user', content: userContent }];
  return nimChatCompletion({
    model: DEFAULTS.vision,
    messages,
    max_tokens,
    temperature: 0.2,
    signal,
  });
}

// Audio call (Nemotron Omni). `audioBase64` is base64-encoded raw audio bytes.
// `format` is the audio container format ('wav', 'mp3', 'webm', 'ogg').
async function audio({ prompt, audioBase64, format = 'wav', history = [], max_tokens = 200, signal } = {}) {
  if (!audioBase64) throw new Error('audio() requires audioBase64');
  const userContent = [
    { type: 'text', text: prompt || 'What sound is this? Reply briefly.' },
    { type: 'input_audio', input_audio: { data: audioBase64, format } },
  ];
  const messages = [...history, { role: 'user', content: userContent }];
  return nimChatCompletion({
    model: DEFAULTS.omni,
    messages,
    max_tokens,
    temperature: 0.2,
    signal,
  });
}

// Embeddings — text only. inputType: "passage" for stored text, "query" for retrieval.
async function embed({ texts, inputType = 'passage', model = DEFAULTS.embed, signal } = {}) {
  if (!texts || !Array.isArray(texts) || texts.length === 0) throw new Error('embed() requires texts: string[]');
  const apiKey = getApiKey();
  const startMs = Date.now();
  const res = await fetch(`${NIM_BASE}/embeddings`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, input: texts, input_type: inputType, truncate: 'END' }),
    signal,
  });
  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`NIM_EMBED_${res.status}: ${errText.slice(0, 240)}`);
  }
  const data = await res.json();
  const vectors = (data.data || []).map(d => d.embedding);
  return {
    success: true,
    vectors,
    dim: vectors[0]?.length || 0,
    model: data.model || model,
    latencyMs: Date.now() - startMs,
    usage: data.usage || null,
  };
}

// Quick health check — returns true if the key + endpoint are good.
async function ping() {
  try {
    const r = await chat({
      messages: [{ role: 'user', content: 'Reply with just the word PONG.' }],
      max_tokens: 8,
      temperature: 0,
    });
    return { ok: true, model: r.model, reply: r.reply, latencyMs: r.latencyMs };
  } catch (err) {
    return { ok: false, error: err.message };
  }
}

module.exports = { chat, vision, audio, embed, ping, DEFAULTS, NIM_BASE };
