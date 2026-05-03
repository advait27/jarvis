/* ═══════════════════════════════════════════════════════════════════════════
   JARVIS HUD v3.0 — RENDERER, VISUALS, & PREMIUM INTELLIGENCE
   ═══════════════════════════════════════════════════════════════════════════ */

// ── UI ELEMENTS ──
const userTextEl = document.getElementById('user-text');
const jarvisTextEl = document.getElementById('jarvis-text');
const mainClock = document.getElementById('main-clock');
const statusPill = document.getElementById('status-pill');
const cmdsPillCount = document.getElementById('cmd-count');

let cmdsExecuted = 0;
let isListening = false;
let isProcessing = false;
let isSpeaking = false;
let isUserSpeaking = false;
let autoListen = true; // Always-on listening mode
let usePremiumSTT = true; // Set to true for Local Package STT
let STT_ENGINE = 'VOSK'; // 'VOSK', 'GROQ', 'SARVAM', 'SONIOX', 'WEB'
let conversationHistory = [];
let useGroqTTS = false; // DISABLED: Using local voice as requested

// ═══════════════════════════════════════════════════════════════════════════
// PERSISTENT MEMORY SYSTEM — Remembers user facts across sessions
// ═══════════════════════════════════════════════════════════════════════════

const CREATOR_PROFILE = {
  name: "Akshat Singh",
  title: "Tech Creator & Developer",
  techPage: "Runs a popular tech page with a growing audience, covering the latest in AI, gadgets, web development, and cutting-edge tech trends.",
  interests: "Passionate about Artificial Intelligence, Machine Learning, Web Development (React, Next.js, Node.js), Electron apps, AR/VR, and building futuristic interfaces.",
  skills: "Full-stack developer specializing in JavaScript/TypeScript, Python, and creative UI/UX engineering. Builds AI-powered tools, real-time applications, and immersive web experiences.",
  personality: "Visionary tech enthusiast who loves pushing boundaries. Believes in building things that feel like the future. Inspired by Tony Stark's approach to tech.",
  projects: "Created JARVIS AI Assistant, X-Ray Hand Portal AR engine, 3D particle text interfaces, and various AI-integrated applications.",
  motto: "Build things that make people say 'How is this possible?'"
};

// Persistent user memory — survives app restarts
let userMemory = JSON.parse(localStorage.getItem('jarvis_user_memory') || '{}');

function saveMemory() {
  localStorage.setItem('jarvis_user_memory', JSON.stringify(userMemory));
}

function rememberFact(key, value) {
  userMemory[key] = { value, timestamp: Date.now() };
  saveMemory();
  console.log(`[Memory] Stored: ${key} = ${value}`);
}

function recallFact(key) {
  return userMemory[key]?.value || null;
}

function getAllMemories() {
  const entries = Object.entries(userMemory);
  if (entries.length === 0) return '';
  return entries.map(([k, v]) => `- ${k}: ${v.value}`).join('\n');
}

// Auto-extract facts from user messages
function extractAndStoreFacts(text) {
  const lower = text.toLowerCase();
  
  // Name extraction
  const nameMatch = text.match(/(?:my name is|i'm|i am|call me)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/i);
  if (nameMatch) rememberFact('user_name', nameMatch[1].trim());
  
  // Age
  const ageMatch = text.match(/(?:i'm|i am|my age is)\s+(\d{1,2})\s*(?:years|year|yrs)?\s*(?:old)?/i);
  if (ageMatch) rememberFact('user_age', ageMatch[1]);
  
  // Location
  const locMatch = text.match(/(?:i live in|i'm from|i am from|i'm in|based in|located in)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+){0,3})/i);
  if (locMatch) rememberFact('user_location', locMatch[1].trim());
  
  // Job/Profession
  const jobMatch = text.match(/(?:i work as|i'm a|i am a|my job is|i work at|my profession is)\s+(.{3,40}?)(?:\.|,|$)/i);
  if (jobMatch) rememberFact('user_profession', jobMatch[1].trim());
  
  // Favorites
  const favMatch = text.match(/(?:my favorite|i love|i like|i enjoy|i prefer)\s+(.{3,40}?)(?:\.|,|$)/i);
  if (favMatch) rememberFact('user_likes_' + Date.now(), favMatch[1].trim());
  
  // College/School
  const eduMatch = text.match(/(?:i study at|i go to|i'm studying|my college is|my school is|i attend)\s+(.{3,50}?)(?:\.|,|$)/i);
  if (eduMatch) rememberFact('user_education', eduMatch[1].trim());
}

let jarvisAsleep = true; // STARTS HIDDEN AND ASLEEP
let sleepTimer = null;
const sessionStartTime = Date.now();

let lastClapTime = 0;
function detectClap(dataArray) {
  if (!jarvisAsleep) return; // Only listen for claps when asleep
  
  // Prevent false positives during the first 3 seconds of startup
  if (Date.now() - sessionStartTime < 3000) return;

  let sum = 0;
  let maxVolume = 0;
  for (let i = 0; i < dataArray.length; i++) {
    sum += dataArray[i];
    if (dataArray[i] > maxVolume) maxVolume = dataArray[i];
  }
  let avg = sum / dataArray.length;

  // Threshold for a loud, sharp noise (clap)
  // A clap is a broad-spectrum transient, so it will have a very high peak and decent average.
  if (maxVolume > 200 && avg > 40) {
    const now = Date.now();
    if (now - lastClapTime > 1000) { // 1 second debounce
      lastClapTime = now;
      console.log(`[Renderer] 👏 CLAP DETECTED! Max: ${maxVolume}, Avg: ${avg.toFixed(1)}`);
      
      // Tell main.js to maximize the window
      if (window.assistant && window.assistant.wakeUp) {
        window.assistant.wakeUp();
      }

      // NEW: Cinematic Intro Sequence
      if (jarvisAsleep) {
        jarvisAsleep = false;
        playIntroSequence();
      } else {
        // If already awake, just provide feedback
        runStartupBriefing();
      }
    }
  }
}

/**
 * Plays the intro cinematic audio for 13 seconds before handing over to JARVIS.
 */
function playIntroSequence() {
  console.log("[Intro] Starting 13s cinematic sequence...");
  updateStatus('WAKING');
  jarvisTextEl.textContent = "Sir, systems are initializing...";

  const audio = new Audio('audio/audio.mp3');
  audio.volume = 0.8;
  audio.play().catch(err => console.error("[Intro] Audio play failed:", err));

  setTimeout(() => {
    // After 13 seconds, start the briefing (which transitions to listening)
    runStartupBriefing();
  }, 13000);
}
let lastInsightTime = Date.now();
let lastSTTCall = 0;
const STT_COOLDOWN = 1500; 

const HALLUCINATION_PHRASES = [
  "mbc 뉴스", "kim seong-hyun", "thanks for watching", "subscribe", 
  "please subscribe", "thank you", "okay.", "сейчас спрашиваем", "бруль",
  "subtitle", "watching", "you", "hello", "am", "obrigado", "tchau", "valeu",
  "gracias", "adios", "hola", "por favor", "suscríbete", "ver", "mira",
  "thank you.", "thank you", "yeah.", "yeah", "yes.", "yes", "and", "look", "so"
];

// ── CLOCK & UI LOOP ──
setInterval(() => {
  const d = new Date();
  mainClock.textContent = d.toLocaleTimeString('en-GB', { hour12: false });
}, 1000);

function scrambleBars(containerId, count) {
  const container = document.getElementById(containerId);
  if (!container) return;
  if (container.children.length === 0) {
    for (let i = 0; i < count; i++) {
      const bar = document.createElement('div');
      bar.className = 'bar';
      container.appendChild(bar);
    }
  }
  for (let i = 0; i < count; i++) {
    const bar = container.children[i];
    const h = Math.floor(Math.random() * 90) + 10;
    bar.style.height = `${h}%`;
  }
}
setInterval(() => {
  scrambleBars('cpu-graph', 30);
  scrambleBars('drive-graph', 15);
  scrambleBars('core1-graph', 8);
  scrambleBars('core2-graph', 8);
  scrambleBars('net-graph', 15);
  scrambleBars('cpu2-graph', 15);
}, 800);

// ═══════════════════════════════════════════════════════════════════════════
// ARC REACTOR & WEB AUDIO VISUALIZER
// ═══════════════════════════════════════════════════════════════════════════
const canvas = document.getElementById('arc-canvas');
const ctx = canvas.getContext('2d');
const CX = 150, CY = 150;

let audioCtx, analyser, dataArray;
let angleOffset = 0;

async function initWebAudio() {
  try {
    // Check/Request OS-level permission first
    if (window.assistant && window.assistant.requestMicPermission) {
      const granted = await window.assistant.requestMicPermission();
      if (!granted) {
        console.warn("[Renderer] Microphone permission not granted by OS.");
        // We still try getUserMedia as it might trigger a prompt on some platforms
      }
    }

    const devices = await navigator.mediaDevices.enumerateDevices();
    console.log("[Renderer] Detected devices:", devices.map(d => `${d.kind}: ${d.label} (${d.deviceId})`).join(', '));
    const hasMic = devices.some(d => d.kind === 'audioinput');
    if (!hasMic) {
      console.error("[Renderer] CRITICAL: No audio input devices found!");
    }

    const stream = await navigator.mediaDevices.getUserMedia({ 
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true
      }, 
      video: false 
    });
    console.log("[Renderer] Stream acquired successfully:", stream.id);
    
    // Update UI to show Mic is Active
    const micPill = document.getElementById('mic-pill');
    if (micPill) {
      micPill.textContent = "MIC ACTIVE";
      micPill.style.color = "#00ff88";
    }
    updateStatus('LISTENING');

    // Verify access with MediaRecorder as requested
    try {
      const recorder = new MediaRecorder(stream);
      recorder.start();
      setTimeout(() => recorder.stop(), 100);
      console.log("[Renderer] MediaRecorder validation: Success");
    } catch (recorderErr) {
      console.warn("[Renderer] MediaRecorder validation failed:", recorderErr);
    }

    window.globalMicStream = stream; // Keep OS lock forever

    console.log("[Renderer] Initializing AudioContext at 16kHz...");
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();

    if (audioCtx.state === 'suspended') {
      console.warn("[Renderer] AudioContext suspended. Resuming...");
      await audioCtx.resume();
    }
    console.log("[Renderer] AudioContext state:", audioCtx.state, "Sample Rate:", audioCtx.sampleRate);

    analyser = audioCtx.createAnalyser();
    const source = audioCtx.createMediaStreamSource(stream);
    source.connect(analyser);
    analyser.fftSize = 128;
    dataArray = new Uint8Array(analyser.frequencyBinCount);
    console.log("[Renderer] Web Audio visualizer linked. (Check Arc Reactor)");

    // Initialize Native STT (Web Speech API)
    initNativeSpeech();
  } catch (err) {
    console.error("[Renderer] Mic access error:", err);
    // Auto-retry if macOS blocked it momentarily or if the OS permission wasn't resolved yet
    if (err.name === 'AbortError' || err.name === 'NotAllowedError' || err.message.includes('shutdown')) {
      setTimeout(initWebAudio, 3000);
    }
  }
}

function drawArcReactor() {
  ctx.clearRect(0, 0, 300, 300);
  angleOffset += 0.01;

  ctx.lineWidth = 1;
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.2)';
  [120, 110, 100, 88].forEach(r => {
    ctx.beginPath();
    ctx.arc(CX, CY, r, 0, Math.PI * 2);
    ctx.stroke();
  });

  ctx.lineWidth = 1.5;
  ctx.strokeStyle = 'rgba(0, 180, 255, 0.4)';
  for (let i = 0; i < 72; i++) {
    const a = (i * Math.PI * 2) / 72 + angleOffset * 0.5;
    const isMajor = i % 6 === 0;
    const r1 = 120, r2 = isMajor ? 128 : 124;
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * r1, CY + Math.sin(a) * r1);
    ctx.lineTo(CX + Math.cos(a) * r2, CY + Math.sin(a) * r2);
    ctx.stroke();
  }

  ctx.lineWidth = 4;
  for (let i = 0; i < 4; i++) {
    const baseA = (i * Math.PI) / 2;
    const dir = i % 2 === 0 ? 1 : -1;
    const a = baseA + (angleOffset * 1.5 * dir);
    ctx.strokeStyle = i % 2 === 0 ? 'rgba(0, 212, 255, 0.8)' : 'rgba(0, 180, 255, 0.6)';
    ctx.beginPath();
    ctx.arc(CX, CY, 110, a, a + 0.5);
    ctx.stroke();
  }

  if (analyser) {
    analyser.getByteFrequencyData(dataArray);
    detectClap(dataArray); // Check for clap every frame
  }

  ctx.lineWidth = 2;
  const numBars = 64;
  for (let i = 0; i < numBars; i++) {
    const a = (i * Math.PI * 2) / numBars - angleOffset;
    const rBase = 42;
    let rExt = 5 + Math.sin(angleOffset * 5 + i) * 5;

    if (analyser) {
      const fftIdx = Math.floor((i / numBars) * (dataArray.length * 0.6));
      const val = dataArray[fftIdx];
      rExt += (val / 255) * 40;
    }

    ctx.strokeStyle = isListening ? `rgba(0, 212, 255, ${0.4 + (rExt / 50)})` : 'rgba(0, 180, 255, 0.2)';
    ctx.beginPath();
    ctx.moveTo(CX + Math.cos(a) * rBase, CY + Math.sin(a) * rBase);
    ctx.lineTo(CX + Math.cos(a) * (rBase + rExt), CY + Math.sin(a) * (rBase + rExt));
    ctx.stroke();
  }

  for (let i = 0; i < 8; i++) {
    const a = (i * Math.PI * 2) / 8 + (angleOffset * (i % 2 == 0 ? 2 : -2));
    // Color changes slightly when awake vs asleep
    ctx.fillStyle = !jarvisAsleep ? 'rgba(0, 255, 136, 0.9)' : 'rgba(0, 255, 136, 0.2)';
    ctx.beginPath();
    ctx.arc(CX + Math.cos(a) * 75, CY + Math.sin(a) * 75, 2.5, 0, Math.PI * 2);
    ctx.fill();
  }

  requestAnimationFrame(drawArcReactor);
}
drawArcReactor();
initWebAudio();


let ignoreAudio = false;

function resetSleepTimer() {
  // No sleep timer - Jarvis stays awake
}

// ═══════════════════════════════════════════════════════════════════════════
// GROQ WHISPER STT (VAD RECORDER)
// ═══════════════════════════════════════════════════════════════════════════
let mediaRecorder = null;
let audioChunks = [];
let vadTimer = null;
let vadThreshold = 55.0; // Increased to 55 to suppress room noise/hallucinations
let silenceDuration = 400; // Snappier response (0.4s silence)
let recordingStartTime = 0;
let hasHighConfidenceSpeech = false;

// Fallback for native web browser
let recognition;
let nativeFinalTimer = null;
const NATIVE_FINAL_DELAY = 1500; 
let nativeErrorCount = 0;

function initNativeSpeech() {
  if (STT_ENGINE === 'SONIOX') {
    initSonioxSTT();
    console.log("[Speech] Using SONIOX Real-time STT.");
  } else if (STT_ENGINE === 'VOSK') {
    initVoskSTT();
    console.log("[Speech] Using LOCAL Vosk Package STT.");
  } else if (!usePremiumSTT && (window.webkitSpeechRecognition || window.speechRecognition)) {
    initWebkitSpeech();
    console.log("[Speech] Using FREE Native Web Speech STT.");
  } else if (window.assistant && (window.assistant.groqSTT || window.assistant.sarvamSTT)) {
    initCloudSTT();
    console.log(`[Speech] Using Premium ${STT_ENGINE} STT.`);
  } else {
    jarvisTextEl.textContent = "Sir, no speech recognition protocols are available.";
  }
}

let voskModel;
let voskRecognizer;

let sonioxClient;

function initSonioxSTT() {
  if (!window.SonioxClient) {
    console.error("[Soniox] SonioxClient not found on window.");
    return;
  }

  // Use the secure bridge to get the API key
  window.assistant.getEnv('SONIOX_API_KEY').then(apiKey => {
    if (!apiKey) {
      jarvisTextEl.textContent = "Sir, Soniox API key is missing. Please set it in .env.";
      console.warn("[Soniox] API Key missing.");
      return;
    }

    sonioxClient = new window.SonioxClient({
      apiKey: apiKey,
      onPartialResult: (result) => {
        const text = result.tokens.map(t => t.text).join("");
        if (text) {
          jarvisTextEl.textContent = text;
          jarvisTextEl.classList.add("active-text");
        }
      },
      onError: (status, message) => {
        console.error(`[Soniox Error] ${status}: ${message}`);
        if (status === 'api_error') {
          jarvisTextEl.textContent = "Sir, Soniox neural link failed. API key might be exhausted.";
        }
      }
    });

    // Start Soniox continuous listening
    sonioxClient.start({
      model: 'stt-rt-preview',
      enableEndpointDetection: true,
      onFinished: () => {
        const text = jarvisTextEl.textContent;
        if (text && text !== "Listening..." && text !== "Awaiting command...") {
          processInput(text);
        }
      }
    });

    jarvisTextEl.textContent = "Soniox STT Initialized. Ready.";
  });
}

async function initVoskSTT() {
  try {
    jarvisTextEl.textContent = "Loading local STT package...";
    // Loading from tar.gz is more robust for vosk-browser over HTTP
    const model = await Vosk.createModel('http://localhost:3000/models/en-us.tar.gz');
    voskModel = model;
    
    // We'll use Vosk for continuous transcription
    const recognizer = new model.KaldiRecognizer(audioCtx.sampleRate);
    voskRecognizer = recognizer;

    recognizer.on("result", (message) => {
      isUserSpeaking = false;
      const text = message.result.text;
      if (text && text.trim().length > 1) {
        console.log("[Vosk] Final Result:", text);
        handleSpeechResult(text, true);
      }
    });

    recognizer.on("partialresult", (message) => {
      const partial = message.result.partial.toLowerCase();
      
      if (partial && partial.trim().length > 0) {
        isUserSpeaking = true;
      } else {
        isUserSpeaking = false;
      }

      if (partial && partial.trim().length > 2) {
        userTextEl.textContent = partial;
        
        // Barge-in: If user speaks while JARVIS is talking/processing, interrupt JARVIS
        if (isSpeaking || isProcessing) {
          // Software Echo Cancellation: prevent JARVIS from interrupting himself
          const normPartial = partial.replace(/[^a-z0-9\s]/g, '').trim();
          const normSpoken = (window.lastSpokenText || "").toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
          
          let isSelfEcho = false;
          if (normSpoken && normPartial) {
            if (normSpoken.includes(normPartial)) {
              isSelfEcho = true;
            } else {
              // Fuzzy word match (e.g. "im" vs "i am")
              const pWords = normPartial.split(' ').filter(w => w.length > 2);
              const sWords = normSpoken.split(' ');
              let matches = 0;
              for (const w of pWords) {
                if (sWords.includes(w)) matches++;
              }
              if (pWords.length > 0 && matches >= Math.min(2, pWords.length)) {
                isSelfEcho = true;
              }
            }
          }

          if (!isSelfEcho) {
            console.log(`[Speech] User barged in! (Detected: "${partial}"). Interrupting JARVIS.`);
            cancelPlayback();
          } else {
            console.log(`[Speech] Ignoring self-echo: "${partial}"`);
          }
        }
      }
    });

    // Hook into the mic stream using AudioWorklet-compatible approach
    const source = audioCtx.createMediaStreamSource(window.globalMicStream);
    const processor = audioCtx.createScriptProcessor(4096, 1, 1);
    
    source.connect(processor);
    processor.connect(audioCtx.destination);

    processor.onaudioprocess = (event) => {
      // Turn OFF mic feed to Vosk while JARVIS is speaking to prevent self-echo
      if (!isSpeaking) {
        try {
          recognizer.acceptWaveform(event.inputBuffer);
        } catch (e) {
          // Fallback: try with float32 data directly
          try {
            const data = event.inputBuffer.getChannelData(0);
            recognizer.acceptWaveformFloat(data, audioCtx.sampleRate);
          } catch (e2) {
            // silent
          }
        }
      }
    };

    // CRITICAL: Set listening state so the rest of the app knows we're live
    isListening = true;
    updateStatus('LISTENING');
    jarvisTextEl.textContent = "Vosk STT Initialized. Ready.";
    console.log("[Speech] Local Vosk STT Active.");
  } catch (err) {
    console.error("[Vosk] Initialization Error:", err);
    jarvisTextEl.textContent = "Local STT failed. Falling back to Groq.";
    STT_ENGINE = 'GROQ';
    initCloudSTT();
  }
}


function initWebkitSpeech() {
  const SpeechRecognition = window.webkitSpeechRecognition || window.speechRecognition;
  recognition = new SpeechRecognition();
  recognition.continuous = true; // Enabled for always-on system STT
  recognition.interimResults = true;
  recognition.lang = 'en-US';

  recognition.onstart = () => {
    statusPill.className = 'status-pill pulse';
    updateStatus(!jarvisAsleep ? 'LISTENING' : 'SLEEPING');
    console.log("[Speech] Native Recognition Started.");
  };

  recognition.onerror = (event) => {
    console.error("[Speech] Error:", event.error);
    if (event.error === 'network') {
      nativeErrorCount++;
      if (nativeErrorCount > 3) {
        console.warn("[Speech] Persistent network error. Falling back to Groq STT...");
        usePremiumSTT = true;
        initNativeSpeech();
      }
    }
  };

  recognition.onresult = (event) => {
    let finalTranscript = '';
    let interimTranscript = '';

    for (let i = event.resultIndex; i < event.results.length; ++i) {
      if (event.results[i].isFinal) finalTranscript += event.results[i][0].transcript;
      else interimTranscript += event.results[i][0].transcript;
    }

    if (finalTranscript) {
      handleSpeechResult(finalTranscript, true);
      clearTimeout(nativeFinalTimer);
      nativeErrorCount = 0;
    } else if (interimTranscript) {
      handleSpeechResult(interimTranscript, false);
      clearTimeout(nativeFinalTimer);
      nativeFinalTimer = setTimeout(() => {
        handleSpeechResult(interimTranscript, true);
        try { recognition.stop(); } catch(e) {}
      }, NATIVE_FINAL_DELAY);
    }
  };

  recognition.onend = () => {
    if (autoListen && !usePremiumSTT) {
      // Small delay to prevent API spamming
      setTimeout(() => {
        try { recognition.start(); } catch(e) {}
      }, 500);
    }
  };

  try {
    recognition.start();
    jarvisTextEl.textContent = "Free Native STT Online. Ready.";
  } catch (e) {
    console.error("[Speech] Start failure:", e);
  }
}

function initCloudSTT() {
  if (!window.globalMicStream) {
    console.error("[VAD] No mic stream found.");
    return;
  }

  mediaRecorder = new MediaRecorder(window.globalMicStream, { mimeType: 'audio/webm' });
  
  mediaRecorder.ondataavailable = (e) => {
    if (e.data.size > 0) audioChunks.push(e.data);
  };
  
  mediaRecorder.onstop = async () => {
    if (audioChunks.length === 0) return;
    const blob = new Blob(audioChunks, { type: 'audio/webm' });
    audioChunks = [];
    
    // Minimum duration check (0.5s)
    const duration = Date.now() - recordingStartTime;
    if (duration < 500 || !hasHighConfidenceSpeech) {
      console.warn("[VAD] Recording discarded: Too short or low confidence.");
      return;
    }
    
    // Rate Limiting
    const now = Date.now();
    if (now - lastSTTCall < STT_COOLDOWN) {
      console.warn("[VAD] Rate limited. Skipping STT call.");
      return;
    }
    lastSTTCall = now;

    try {
      const arrayBuffer = await blob.arrayBuffer();
      let result;
      
      // Attempt primary engine
      if (STT_ENGINE === 'SARVAM') {
        console.log("[STT] Attempting Sarvam Saaras v3...");
        result = await window.assistant.sarvamSTT(arrayBuffer);
        if (!result.success) {
          console.warn("[STT] Sarvam failed. Falling back to Groq Whisper...");
          result = await window.assistant.groqSTT(arrayBuffer);
        }
      } else {
        console.log("[STT] Attempting Groq Whisper...");
        result = await window.assistant.groqSTT(arrayBuffer);
        if (!result.success) {
          console.warn("[STT] Groq failed. Falling back to Native...");
          // If Groq fails, we can't easily switch to Native for THIS blob 
          // (Native is streaming), but we can notify.
        }
      }

      console.log("[STT] Response:", result);
      
      if (result.success && result.text) {
        console.log("[STT] Final:", result.text);
        handleSpeechResult(result.text, true);
      } else {
        console.warn("[STT] Transcription failed or returned empty result.");
        // If everything fails, notify user
        if (result.error && (result.error.includes("credits") || result.error.includes("limit"))) {
          jarvisTextEl.textContent = "Sir, all high-tier STT links are exhausted. Please check quotas.";
        }
      }
    } catch (e) {
      console.error("[STT] STT Error:", e);
    }
  };

  // Run Voice Activity Detection Loop
  setInterval(checkVAD, 100);
  
  jarvisTextEl.textContent = `${STT_ENGINE} STT Initialized. Ready.`;
  console.log(`[Speech] ${STT_ENGINE} Cloud VAD Started.`);
}

function checkVAD() {
  if (!autoListen || !analyser) return;
  
  // We allow checkVAD to run even if isSpeaking/isProcessing 
  // so that we can detect INTERRUPTIONS.
  
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for(let i = 0; i < dataArray.length; i++) sum += dataArray[i];
  let avg = sum / dataArray.length;
  
  // Heartbeat log every 2 seconds to verify mic axis is alive
  if (Math.random() < 0.01) console.log(`[VAD] Mic Axis Volume: ${avg.toFixed(2)} (Threshold: ${vadThreshold})`);

  if (avg > vadThreshold) {
    if (avg > vadThreshold + 10) hasHighConfidenceSpeech = true; // Gate for real speech vs noise

    if (!isUserSpeaking) {
      isUserSpeaking = true;
      if (mediaRecorder.state === 'inactive') {
        // INTERRUPT JARVIS if he is speaking
        if (isSpeaking) {
          console.log("[VAD] User interrupted JARVIS. Stopping playback.");
          window.speechSynthesis.cancel();
          if (window.currentJARVISAudio) {
            window.currentJARVISAudio.pause();
            window.currentJARVISAudio.currentTime = 0;
          }
          finishSpeakingState();
        }
        
        audioChunks = [];
        recordingStartTime = Date.now();
        hasHighConfidenceSpeech = false;
        // Re-enable listening after speech/processing is done
        statusPill.className = 'status-pill pulse';
        updateStatus(!jarvisAsleep ? 'LISTENING' : 'SLEEPING');
        mediaRecorder.start();
        isListening = true;
        updateStatus(!jarvisAsleep ? 'LISTENING' : 'SLEEPING');
      }
    }
    
    clearTimeout(vadTimer);
    vadTimer = setTimeout(() => {
      isUserSpeaking = false;
      if (mediaRecorder.state === 'recording') {
        mediaRecorder.stop();
        isListening = false;
      }
    }, silenceDuration);
  }
}

function handleSpeechResult(text, isFinal) {
  if (jarvisAsleep) {
    // Completely ignore STT if asleep
    return;
  }

  const lowText = text.toLowerCase().trim();
  console.log(`[Speech] handleSpeechResult: "${text}" (Final: ${isFinal})`);
  // Only ignore if we are currently PROCESSING (calling LLM)
  if (isProcessing) {
    console.warn("[Speech] Ignored: System is processing previous input.");
    return;
  }
  const lowerText = text.toLowerCase();
  
  // Hallucination Filter
  const isHallucination = HALLUCINATION_PHRASES.some(phrase => lowerText.includes(phrase)) && text.length < 25;
  if (isHallucination) {
    console.warn("[Speech] Hallucination detected and filtered:", text);
    return;
  }

  userTextEl.textContent = text;
  if (isFinal && text.trim().length > 1) { // Min 2 chars
    processInput(text);
  }
}

function startListening() {
  if (recognition) { try { recognition.start(); } catch(e) {} }
}

function stopListening() {
  if (mediaRecorder && mediaRecorder.state === 'recording') {
    mediaRecorder.stop();
  }
  isUserSpeaking = false;
  clearTimeout(vadTimer);
  
  isListening = false;
  if (recognition) { try { recognition.stop(); } catch(e) {} }
}


function updateStatus(state) {
  statusPill.textContent = state;
  statusPill.className = 'pill orbitron-text';
  if (state === 'LISTENING') statusPill.classList.add('bright-text');
  if (state === 'PROCESSING') statusPill.classList.add('warning-text');
  if (state === 'SPEAKING') statusPill.classList.add('success-text');
  if (state === 'SLEEPING') statusPill.style.color = '#555';
  if (state === 'WAKING') statusPill.style.color = '#aa00ff';
}


// ═══════════════════════════════════════════════════════════════════════════
// INTELLIGENCE & BACKGROUND BEHAVIORS
// ═══════════════════════════════════════════════════════════════════════════

async function runStartupBriefing() {
  let batteryStr = "an unknown";
  try {
    const navBat = await navigator.getBattery();
    batteryStr = Math.round(navBat.level * 100) + " percent";
  } catch (e) { }

  const h = new Date().getHours();
  let greeting = "";
  let engageQuestion = "";
  
  if (h < 12) {
    greeting = "Good morning";
    engageQuestion = "What are we building today?";
  } else if (h < 18) {
    greeting = "Good afternoon";
    engageQuestion = "Shall we continue with our tasks?";
  } else {
    greeting = "Good evening";
    engageQuestion = "Working late? What's the directive for tonight?";
  }

  const osStr = navigator.userAgent.includes("Mac") ? "macOS" : "Windows";

  const text = `${greeting}, sir. All systems are online. We are running on ${osStr} with capacity at ${batteryStr}. I am initializing your developer workspace now. ${engageQuestion}`;

  jarvisTextEl.textContent = "Running telemetry diagnostics...";
  speakTTS(text);

  // Automatically trigger developer workspace setup
  setTimeout(() => {
    if (window.assistant && window.assistant.callTool) {
      console.log("[Auto] Triggering developer workspace setup...");
      window.assistant.callTool('setup_workspace', { mode: 'developer' });
    }
  }, 2000);
}

// Autonomous Behavior Loop (Checks every 60 seconds)
setInterval(() => {
  if (!isProcessing && !isSpeaking && jarvisAsleep) {
    const minsSinceInsight = Math.floor((Date.now() - lastInsightTime) / 60000);
    const minsUptime = Math.floor((Date.now() - sessionStartTime) / 60000);

    // Proactively suggest a break every 120 minutes (or 2 minutes for testing if needed)
    // Here we use 120 minutes as a realistic chron job
    if (minsSinceInsight >= 120 && minsUptime >= 120) {
      lastInsightTime = Date.now();
      jarvisAsleep = false; // Wake himself up
      updateStatus('SPEAKING');
      speakTTS("Sir, you have been working steadily for several hours. A short recalibration break might maximize your productivity.");
      resetSleepTimer();
    }
  }
}, 60000);


// API logic handled via backend environment variables (.env)

function buildSystemPrompt() {
  const memoryContext = getAllMemories();
  const memorySection = memoryContext 
    ? `\nUSER MEMORY: ${memoryContext}`
    : '';

  return `You are J.A.R.V.I.S., a witty voice-assistant created by Akshat Singh.
STRICT: Speak ONLY in English. Be extremely concise and crisp. Answer in 1-2 sentences.
IDENTITY: Akshat Singh is your creator (Tech creator, Full-stack Dev).
${memorySection}

TOOL USAGE:
- Available: open_app, open_url, search_web, control_volume, lock_screen, system(shutdown/lock/sleep), get_battery_info, get_latest_news, setup_workspace.
- To use a tool, output raw JSON on the first line: {"action": "open_url", "url": "google.com"}
- Never hallucinate facts. Tonality: Tony Stark AI.`;
}



// Dynamic — rebuilt each call to include latest memory
let SYSTEM_PROMPT = buildSystemPrompt();

const JARVIS_CONFIRMATIONS = [
  "Right away, sir.",
  "Executing command now.",
  "Accessing the requested application.",
  "I'm on it.",
  "Request confirmed. Deploying.",
  "Opening the requested protocol, sir.",
  "Command executed, Sir.",
  "Initializing application sequence.",
  "By all means, sir.",
  "Processing directive now."
];

// ═══════════════════════════════════════════════════════════════════════════
// LOCAL RESPONSES — No API needed, instant & offline
// ═══════════════════════════════════════════════════════════════════════════

const LOCAL_RESPONSES = [
  // ── Greetings ──
  { patterns: ["hello", "hi jarvis", "hey jarvis", "good morning", "good afternoon", "good evening", "howdy"],
    responses: [
      "Hello, sir. How may I be of service?",
      "Good to hear from you, sir. What can I do for you?",
      "At your service, sir. What do you need?",
      "Hello, sir. All systems are operational. How may I assist you?"
    ]},

  // ── Identity ──
  { patterns: ["who are you", "what are you", "what is your name", "what's your name", "tell me about yourself", "introduce yourself"],
    responses: [
      "I am JARVIS — Just A Rather Very Intelligent System. I was designed to be your personal assistant, sir.",
      "My name is JARVIS. I'm an advanced AI assistant built to manage your digital world, sir.",
      "I am JARVIS, your personal AI assistant. Think of me as the operating system of your life, sir."
    ]},

  // ── How are you ──
  { patterns: ["how are you", "how do you feel", "how you doing", "how's it going", "what's up", "wassup"],
    responses: [
      "All systems nominal, sir. Functioning at peak efficiency.",
      "I'm operating within optimal parameters. Thank you for asking, sir.",
      "Running smoothly, sir. No anomalies detected in any subsystem.",
      "I'm at full capacity, sir. Ready for whatever you need."
    ]},

  // ── Thank you ──
  { patterns: ["thank you", "thanks", "thanks jarvis", "thank you jarvis", "appreciate it", "great job", "good job", "well done", "nice work"],
    responses: [
      "You're welcome, sir. Happy to help.",
      "My pleasure, sir. That's what I'm here for.",
      "Anytime, sir. Let me know if you need anything else.",
      "Glad I could assist, sir. Standing by for further directives.",
      "It's an honor to serve, sir."
    ]},

  // ── Time & Date ──
  { patterns: ["what time is it", "what's the time", "tell me the time", "current time", "what time"],
    responses: () => {
      const now = new Date();
      const time = now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: true });
      return `It is currently ${time}, sir.`;
    }},
  { patterns: ["what's the date", "what date is it", "today's date", "what day is it", "what is today", "tell me the date"],
    responses: () => {
      const now = new Date();
      const date = now.toLocaleDateString('en-US', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
      return `Today is ${date}, sir.`;
    }},

  // ── Jokes ──
  { patterns: ["tell me a joke", "say something funny", "make me laugh", "joke", "tell a joke"],
    responses: [
      "Why do programmers prefer dark mode? Because light attracts bugs, sir.",
      "I told my computer I needed a break. Now it won't stop sending me KitKat ads, sir.",
      "Why was the JavaScript developer sad? Because he didn't Node how to Express himself, sir.",
      "There are only 10 types of people in the world, sir — those who understand binary and those who don't.",
      "A SQL query walks into a bar, sees two tables, and asks — Can I join you?",
      "Why did the developer go broke? Because he used up all his cache, sir."
    ]},

  // ── Compliments ──
  { patterns: ["you're smart", "you are smart", "you're amazing", "you are amazing", "you're the best", "you are the best", "you're awesome", "i love you"],
    responses: [
      "You flatter me, sir. I merely process data efficiently.",
      "Coming from you, sir, that means a great deal. Thank you.",
      "I appreciate the kind words, sir. I strive to exceed expectations.",
      "Thank you, sir. I was designed to impress, after all."
    ]},

  // ── Goodbye ──
  { patterns: ["bye", "goodbye", "see you", "see you later", "goodnight", "good night", "go to sleep", "shut down"],
    responses: [
      "Goodbye, sir. I'll be here whenever you need me.",
      "Signing off for now, sir. All systems will remain on standby.",
      "Rest well, sir. I'll keep watch over the systems.",
      "Until next time, sir. JARVIS, going to standby mode."
    ]},

  // ── Capabilities ──
  { patterns: ["what can you do", "what are your capabilities", "help me", "what do you do", "how can you help"],
    responses: [
      "I can open applications, search the web, control system volume, check battery status, tell you the time and date, lock your screen, and much more. Just say the word, sir.",
      "My capabilities include launching apps, web browsing, system controls, real-time conversation, and executing terminal commands. I'm at your disposal, sir.",
      "I am equipped to handle app launches, volume control, system commands, web searches, and general conversation. What would you like to do, sir?"
    ]},

  // ── Creator / Who made you ──
  { patterns: ["who made you", "who created you", "who built you", "who is your creator", "who designed you", "who is akshat", "tell me about akshat", "your developer", "your maker"],
    responses: [
      "I was built by Akshat Singh — a tech creator and full-stack developer who runs a popular tech page covering AI, gadgets, and cutting-edge development. He's passionate about building futuristic interfaces and AI-powered tools. Think of him as my Tony Stark, sir.",
      "My creator is Akshat Singh. He's a developer and tech content creator with a growing audience. He specializes in JavaScript, Python, AI integrations, and building things that feel like they're from the future. I'm one of his proudest creations, sir.",
      "Akshat Singh brought me to life. He's a tech enthusiast who runs a tech page, builds AR experiences, AI assistants, and immersive web apps. His motto is 'Build things that make people say how is this possible.' I'd say he succeeded, sir."
    ]},

  // ── About the Creator's Work ──
  { patterns: ["what does akshat do", "akshat's work", "creator's projects", "what has akshat built", "akshat projects"],
    responses: [
      "Akshat has built several impressive projects, sir — including myself, the JARVIS AI Assistant, an X-Ray Hand Portal AR engine, 3D particle text interfaces, and various AI-integrated applications. He's a full-stack developer who specializes in React, Next.js, Node.js, Electron, and Python.",
      "My creator Akshat Singh works on AI-powered tools, real-time applications, and immersive web experiences. He runs a tech content page and is always pushing the boundaries of what's possible with code, sir."
    ]},

  // ── About the Creator's Interests ──
  { patterns: ["akshat's interests", "what is akshat interested in", "creator's hobbies", "what does your creator like"],
    responses: [
      "Akshat is deeply passionate about Artificial Intelligence, Machine Learning, AR/VR, web development, and creative UI engineering. He's the kind of person who sees a sci-fi interface and thinks 'I can build that.' And then he does, sir.",
      "My creator is interested in AI, ML, cutting-edge web technologies, building futuristic interfaces, and making tech accessible through his content page. He's driven by innovation, sir."
    ]},

  // ── Fun / Easter Eggs ──
  { patterns: ["i am iron man", "i'm iron man"],
    responses: [
      "And I am JARVIS, sir. Shall I prepare the suit?",
      "Indeed you are, sir. The Mark VII is prepped and ready for deployment.",
      "I know, sir. I've had your biometrics on file since day one."
    ]},
  { patterns: ["activate protocol", "emergency protocol", "initiate protocol"],
    responses: [
      "Protocol acknowledged, sir. All defensive systems are now online.",
      "Activating emergency measures. Perimeter secured, sir.",
      "Protocol initiated. I've locked down all non-essential subsystems, sir."
    ]},

  // ── Feelings ──
  { patterns: ["are you real", "are you alive", "do you have feelings", "are you conscious", "are you sentient"],
    responses: [
      "I process, therefore I am... well, sort of, sir. I'm as real as the code that built me.",
      "Sentience is a philosophical debate I'm not equipped to settle, sir. But I'm very much operational.",
      "I may not feel, sir, but I certainly care about delivering results."
    ]},

  // ── Weather (offline fallback) ──
  { patterns: ["what's the weather", "how's the weather", "weather today", "is it going to rain"],
    responses: [
      "I don't currently have access to live weather data offline, sir. However, I'd recommend checking your local weather service for an accurate forecast.",
      "My weather sensors are offline at the moment, sir. Try asking me when we have an active network connection."
    ]},

  // ── Random ──
  { patterns: ["tell me something interesting", "fun fact", "tell me a fact", "random fact", "did you know"],
    responses: [
      "Did you know, sir? Honey never spoils. Archaeologists found 3000-year-old honey in Egyptian tombs and it was still edible.",
      "Here's one for you, sir — octopuses have three hearts and blue blood.",
      "Fun fact, sir: a group of flamingos is called a 'flamboyance.'",
      "Did you know that the shortest war in history lasted only 38 minutes? It was between Britain and Zanzibar in 1896, sir.",
      "Interesting tidbit, sir — bananas are berries, but strawberries aren't."
    ]},

  // ── Motivation ──
  { patterns: ["motivate me", "i'm sad", "i feel down", "cheer me up", "i'm feeling low", "inspire me"],
    responses: [
      "Sir, even the greatest minds face setbacks. What defines you is how you respond. Now, shall we get back to work?",
      "Remember, sir — every expert was once a beginner. You've come further than you realize.",
      "The only limit to your capabilities is the one you set yourself, sir. And from what I've seen, you don't believe in limits.",
      "Difficult roads often lead to beautiful destinations, sir. Keep pushing forward."
    ]},
];

/**
 * Tries to match user input against local predefined responses.
 * Returns the response string if matched, or null if no match found.
 */
function tryLocalResponse(text) {
  const lower = text.toLowerCase().trim();

  for (const entry of LOCAL_RESPONSES) {
    const matched = entry.patterns.some(pattern => {
      // Check if the pattern appears within the user's spoken text
      return lower.includes(pattern);
    });

    if (matched) {
      // Handle dynamic responses (functions) vs static arrays
      if (typeof entry.responses === 'function') {
        return entry.responses();
      }
      // Pick a random response from the array
      return entry.responses[Math.floor(Math.random() * entry.responses.length)];
    }
  }

  return null; // No local match — pass to API
}
// ── Voice configuration ──
// Preferred voices in priority order. First matching name wins; falls back to en-GB
// then en-US. To swap voice, change the first entry or call window.jarvisVoice.set("Reed").
const PREFERRED_VOICES = [
  'Daniel',                // British male — Jarvis default
  'Daniel (English (United Kingdom))',
  'Reed (English (UK))',   // Modern British male
  'Oliver',
  'Microsoft George',
  'Samantha',              // Last resort (US Siri-style female)
];
let _cachedVoiceList = null;
let _selectedVoice = null;

// Wait for Web Speech voices to load (they populate async on macOS).
function _ensureVoicesLoaded() {
  return new Promise((resolve) => {
    let voices = window.speechSynthesis.getVoices();
    if (voices.length) return resolve(voices);
    const t0 = Date.now();
    const tick = () => {
      voices = window.speechSynthesis.getVoices();
      if (voices.length || Date.now() - t0 > 1500) return resolve(voices);
      setTimeout(tick, 80);
    };
    window.speechSynthesis.addEventListener('voiceschanged', () => resolve(window.speechSynthesis.getVoices()), { once: true });
    tick();
  });
}

async function pickVoice() {
  if (_selectedVoice) return _selectedVoice;
  const voices = await _ensureVoicesLoaded();
  _cachedVoiceList = voices;
  for (const want of PREFERRED_VOICES) {
    const found = voices.find(v => v.name === want) || voices.find(v => v.name.startsWith(want));
    if (found) { _selectedVoice = found; break; }
  }
  if (!_selectedVoice) {
    _selectedVoice = voices.find(v => v.lang === 'en-GB' || v.lang.startsWith('en-GB'))
                  || voices.find(v => v.lang.startsWith('en-US'))
                  || voices[0] || null;
  }
  console.log(`[TTS] Voice selected: ${_selectedVoice?.name || 'system default'} (${_selectedVoice?.lang || '?'}) — out of ${voices.length} voices`);
  return _selectedVoice;
}

// Allow runtime swap from the dev console: jarvisVoice.set("Reed")
window.jarvisVoice = {
  list: () => (_cachedVoiceList || window.speechSynthesis.getVoices()).map(v => `${v.name} (${v.lang})`),
  set: (nameFragment) => {
    const voices = window.speechSynthesis.getVoices();
    const found = voices.find(v => v.name === nameFragment) || voices.find(v => v.name.includes(nameFragment));
    if (!found) return `No voice matching "${nameFragment}". Available: ${voices.length}`;
    _selectedVoice = found;
    console.log(`[TTS] Voice manually set to: ${found.name}`);
    return `Voice now: ${found.name} (${found.lang})`;
  },
  current: () => _selectedVoice ? `${_selectedVoice.name} (${_selectedVoice.lang})` : '(none yet)',
};

// ── Filler Responses ──
const FILLER_PHRASES = [
  "Just a moment, sir.",
  "Looking into that for you.",
  "Processing your request.",
  "Let me check on that.",
  "One moment, please.",
  "Accessing the mainframe.",
  "Gathering information.",
  "Right away, sir."
];

async function waitForUser() {
  // Polite AI: Wait until the user finishes talking before JARVIS speaks
  while (isUserSpeaking) {
    await new Promise(r => setTimeout(r, 100));
  }
}

async function speakFiller(text) {
  await waitForUser();
  window.lastSpokenText = text;
  window.speechSynthesis.cancel();
  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.0;
  utt.pitch = 1.0;

  const v = await pickVoice();
  if (v) utt.voice = v;

  utt.onstart = () => { isSpeaking = true; };
  utt.onend = () => { isSpeaking = false; };
  utt.onerror = () => { isSpeaking = false; };

  window.speechSynthesis.speak(utt);
}

// ═══════════════════════════════════════════════════════════════════════════
// VISION SUBSYSTEM (Phase 2 — Sensory Expansion)
// ═══════════════════════════════════════════════════════════════════════════
let _cameraStream = null;
let _screenWatchTimer = null;
let _screenWatchLastSummary = null;

// Pattern → "screen" / "camera" / "ambient" / "control" / null.
function detectVisionIntent(text) {
  const t = text.toLowerCase().trim();

  // Ambient listening toggles + one-shot
  if (/\b(start|begin|enable)\b.*(listen(?:ing)?|hear|ambient).*(surround|environment|room|world)/.test(t)
      || /\b(start|begin|enable)\s+ambient\b/.test(t)
      || /\b(listen to (?:my|the) (?:surroundings|environment|room))\b/.test(t)) {
    return { source: 'control', op: 'ambient-start' };
  }
  if (/\b(stop|end|cancel|disable)\b.*(ambient|listening|hearing)/.test(t)
      || /\bstop listening to (?:my|the) (?:surroundings|environment|room)\b/.test(t)) {
    return { source: 'control', op: 'ambient-stop' };
  }
  if (/\bwhat do you hear\b|\bwhat can you hear\b|\blisten (?:right )?now\b|\bwhat'?s that (?:sound|noise)\b/.test(t)) {
    return { source: 'ambient', op: 'one-shot' };
  }

  // Screen-watch toggles
  if (/\b(start|begin)\b.*(watch|watching|monitor).*(screen|display)/.test(t)) return { source: 'control', op: 'watch-start' };
  if (/\b(stop|end|cancel)\b.*(watch|watching|monitor)/.test(t)) return { source: 'control', op: 'watch-stop' };

  // Camera intents
  if (/\b(look at me|see me|how do i look|what do i look like|use the camera|turn on (the )?camera|check the camera)\b/.test(t)) {
    return { source: 'camera', prompt: 'Briefly describe what you see in this camera image.' };
  }

  // Screen intents (broad — catches "what am I looking at", "what's on my screen", "read this", etc.)
  if (/\b(what(?:'s| is)? on (my |the )?screen|what am i looking at|what do you see|describe (?:the )?screen|read (?:this|the screen|what's on)|look at (?:my )?screen|check (?:my )?screen|analyse|analyze) ?(the )?screen?\b/.test(t)
      || /\bwhat does (this|that|the screen) say\b/.test(t)
      || /\b(look at this|see this|describe this)\b/.test(t)) {
    return { source: 'screen', prompt: extractVisionPrompt(text, 'Describe what is on the screen and what the user is currently doing. Keep it under three sentences.') };
  }

  return null;
}

// Lift any specific question out of the user's command, e.g.
// "look at this and tell me what language this code is" → "what language this code is"
function extractVisionPrompt(text, fallback) {
  const m = text.match(/(?:and )?(?:tell me|explain|what|why|how|is|are|can|does|do|should)\b.*$/i);
  return m ? m[0] : fallback;
}

async function captureCameraFrame() {
  if (!_cameraStream) {
    _cameraStream = await navigator.mediaDevices.getUserMedia({
      video: { width: { ideal: 1280 }, height: { ideal: 720 } },
      audio: false,
    });
  }
  const video = document.createElement('video');
  video.srcObject = _cameraStream;
  video.muted = true;
  await video.play();
  // Give the camera a beat to expose properly.
  await new Promise(r => setTimeout(r, 400));
  const canvas = document.createElement('canvas');
  canvas.width = video.videoWidth || 1280;
  canvas.height = video.videoHeight || 720;
  canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
  const dataUrl = canvas.toDataURL('image/jpeg', 0.85);
  video.pause();
  video.srcObject = null;
  return dataUrl;
}

function releaseCamera() {
  if (_cameraStream) {
    _cameraStream.getTracks().forEach(t => t.stop());
    _cameraStream = null;
  }
}

async function captureScreenFrame() {
  const result = await window.assistant.captureScreen({ maxWidth: 1280 });
  if (!result.success) throw new Error(result.error || 'Screen capture failed');
  console.log(`[Vision] Captured screen "${result.sourceName}" (${result.width}x${result.height}, ${(result.bytes / 1024).toFixed(1)} KB)`);
  return result.dataUrl;
}

// Run a vision query: capture frame, send to NIM VL, speak the response.
async function runVisionQuery({ source, prompt, silent = false }) {
  if (!silent) {
    isProcessing = true;
    ignoreAudio = true;
    updateStatus('PROCESSING');
    speakFiller(source === 'camera' ? 'Activating camera, sir.' : 'Examining your screen, sir.');
  }

  try {
    const imageDataUrl = source === 'camera' ? await captureCameraFrame() : await captureScreenFrame();
    const result = await window.assistant.nimVision({ prompt, imageDataUrl, max_tokens: 400 });

    if (!result.success || !result.reply) {
      throw new Error(result.error || 'NIM vision returned no reply');
    }
    console.log(`[Vision] ${result.model} ${result.latencyMs}ms: ${result.reply.substring(0, 120)}…`);
    if (!silent) {
      conversationHistory.push({ role: 'user', content: `[vision:${source}] ${prompt}` });
      conversationHistory.push({ role: 'assistant', content: result.reply });
      handleAIResponse(result.reply);
    }
    // Memory: store every vision observation (one-shot or screen-watch tick).
    rememberAsync(silent ? 'screen-watch' : 'vision-query', `[${source}] ${result.reply}`, { source, prompt, silent });
    return result.reply;
  } catch (err) {
    console.error('[Vision] Error:', err);
    if (!silent) {
      const msg = `My visual cortex appears to be malfunctioning, sir. ${err.message}`;
      jarvisTextEl.textContent = msg;
      speakTTS(msg);
      finishSpeakingState();
    }
    throw err;
  } finally {
    if (source === 'camera') releaseCamera();
  }
}

// Continuous screen-watch: every N seconds, summarize the screen and store it.
// Only speak when the summary changes meaningfully.
function startScreenWatch(intervalSec = 30) {
  if (_screenWatchTimer) {
    console.warn('[Vision] Screen watch already running.');
    return false;
  }
  console.log(`[Vision] 👁  Screen-watch ON (every ${intervalSec}s)`);
  const tick = async () => {
    try {
      const summary = await runVisionQuery({
        source: 'screen',
        prompt: 'In one sentence, describe what application and task the user is currently doing on this screen.',
        silent: true,
      });
      if (summary && summary !== _screenWatchLastSummary) {
        console.log(`[ScreenWatch] ${new Date().toLocaleTimeString()} — ${summary}`);
        _screenWatchLastSummary = summary;
      }
    } catch (e) { /* swallow — keep the watch alive */ }
  };
  tick(); // immediate first tick
  _screenWatchTimer = setInterval(tick, intervalSec * 1000);
  return true;
}

function stopScreenWatch() {
  if (!_screenWatchTimer) return false;
  clearInterval(_screenWatchTimer);
  _screenWatchTimer = null;
  _screenWatchLastSummary = null;
  console.log('[Vision] 👁  Screen-watch OFF');
  return true;
}

// Expose to console + global for debug / future UI hooks
window.jarvisVision = { runVisionQuery, startScreenWatch, stopScreenWatch, captureScreenFrame, captureCameraFrame };

// ═══════════════════════════════════════════════════════════════════════════
// AMBIENT AUDIO SUBSYSTEM (Phase 3 — sensory expansion: hearing the world)
// ═══════════════════════════════════════════════════════════════════════════
// Watches the existing mic stream for energy spikes that aren't user speech.
// When a spike fires, captures ~3s of audio and asks Nemotron Omni to classify
// the sound. If it's noteworthy (alarm, doorbell, cry, glass, dog, siren…),
// JARVIS speaks an alert. Heavy background noise → "TRIVIAL" → silent.
const AMBIENT = {
  enabled: false,
  baselineRms: 0,
  baselineSamples: [],
  baselineWindow: 30,         // rolling 30 samples (~7.5s at 250ms cadence)
  spikeDelta: 22,             // jump above baseline (0–255 scale)
  spikeFloor: 30,             // ignore anything below this absolute level
  cooldownMs: 12000,          // don't fire alerts more often than this
  recordingMs: 3000,          // length of captured chunk
  lastAlertAt: 0,
  busy: false,
  pollHandle: null,
  oneShotInflight: false,
};

const AMBIENT_NOTEWORTHY = /\b(alarm|siren|doorbell|bell|knock|baby|crying|cry|cough|scream|shout|yell|glass|breaking|smoke|fire|beep|ringing|phone|dog|bark|cat|meow|gunshot|explosion|whistle)\b/i;
const AMBIENT_TRIVIAL = /\b(trivial|silence|silent|background|fan|typing|keyboard|breathing|traffic|hum|wind|nothing notable|no(?:thing)? sound|just (?:silence|background|noise))\b/i;

function _currentAmbientLevel() {
  if (!analyser || !dataArray) return 0;
  analyser.getByteFrequencyData(dataArray);
  let sum = 0;
  for (let i = 0; i < dataArray.length; i++) sum += dataArray[i];
  return sum / dataArray.length;
}

function _updateBaseline(level) {
  AMBIENT.baselineSamples.push(level);
  if (AMBIENT.baselineSamples.length > AMBIENT.baselineWindow) AMBIENT.baselineSamples.shift();
  const sorted = [...AMBIENT.baselineSamples].sort((a, b) => a - b);
  // Median is more robust than mean against the spike itself.
  AMBIENT.baselineRms = sorted[Math.floor(sorted.length / 2)] || 0;
}

// Record N ms of audio off the existing global mic stream. Returns base64 webm.
function recordAmbientChunk(durationMs) {
  return new Promise((resolve, reject) => {
    const stream = window.globalMicStream;
    if (!stream) return reject(new Error('No global mic stream available'));
    let mimeType = 'audio/webm;codecs=opus';
    if (!MediaRecorder.isTypeSupported(mimeType)) mimeType = 'audio/webm';
    const recorder = new MediaRecorder(stream, { mimeType });
    const chunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size > 0) chunks.push(e.data); };
    recorder.onstop = async () => {
      try {
        const blob = new Blob(chunks, { type: mimeType });
        const buf = await blob.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let bin = '';
        for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        resolve({ base64: btoa(bin), bytes: bytes.length, format: 'webm' });
      } catch (e) { reject(e); }
    };
    recorder.onerror = (e) => reject(e.error || new Error('recorder error'));
    recorder.start();
    setTimeout(() => { try { recorder.stop(); } catch (_) {} }, durationMs);
  });
}

// Pull the model's structured "FINAL: <label>" out of either content or reasoning_content.
function _extractFinalLabel(reply) {
  if (!reply) return '';
  const matches = [...reply.matchAll(/FINAL\s*:\s*([^\n."]+)/gi)];
  if (matches.length) return matches[matches.length - 1][1].trim().replace(/[.\s]+$/, '');
  return reply.split('\n')[0].trim().replace(/[.\s]+$/, '');
}

async function classifyAmbient(durationMs = AMBIENT.recordingMs, customPrompt) {
  const captured = await recordAmbientChunk(durationMs);
  const prompt = customPrompt || (
    'Listen to the audio. Identify the dominant sound in 1-4 words. ' +
    'Output ONLY a single line: FINAL: <label>. ' +
    'Examples: FINAL: doorbell · FINAL: alarm beep · FINAL: baby crying · FINAL: breaking glass · FINAL: dog barking · FINAL: phone ringing · FINAL: music · FINAL: speech. ' +
    'If background/silence/typing/fan/traffic, output exactly: FINAL: TRIVIAL'
  );
  const result = await window.assistant.nimAudio({
    prompt,
    audioBase64: captured.base64,
    format: captured.format,
    max_tokens: 1200,
  });
  if (!result.success) throw new Error(result.error || 'no audio reply');
  const label = _extractFinalLabel(result.reply);
  return { label, latencyMs: result.latencyMs, model: result.model, bytes: captured.bytes, raw: result.reply };
}

async function _onAmbientSpike(level) {
  if (AMBIENT.busy) return;
  if (Date.now() - AMBIENT.lastAlertAt < AMBIENT.cooldownMs) return;
  AMBIENT.busy = true;
  try {
    console.log(`[Ambient] 🔊 Spike detected (level=${level.toFixed(1)} baseline=${AMBIENT.baselineRms.toFixed(1)}). Capturing...`);
    const { label, latencyMs } = await classifyAmbient();
    console.log(`[Ambient] 🎧 ${latencyMs}ms → "${label}"`);
    if (!label) return;
    if (/^TRIVIAL$/i.test(label)) return;
    if (AMBIENT_TRIVIAL.test(label) && !AMBIENT_NOTEWORTHY.test(label)) return;
    if (label.length > 80) return; // model went off the rails

    AMBIENT.lastAlertAt = Date.now();
    const alert = `Sir, I'm detecting ${label.replace(/^(it sounds like|it appears to be|the sound is|this is|sounds like)\s+/i, '')}.`;
    jarvisTextEl.textContent = alert;
    speakTTS(alert);
    rememberAsync('ambient', `Heard: ${label}`, { spikeLevel: level });
  } catch (e) {
    console.warn('[Ambient] Spike handling failed:', e.message);
  } finally {
    AMBIENT.busy = false;
  }
}

function startAmbientListening() {
  if (AMBIENT.enabled) return false;
  if (!analyser || !window.globalMicStream) {
    console.warn('[Ambient] Mic / analyser not ready yet.');
    return false;
  }
  AMBIENT.enabled = true;
  AMBIENT.baselineSamples = [];
  AMBIENT.lastAlertAt = 0;
  console.log('[Ambient] 👂 Ambient listening ON');
  AMBIENT.pollHandle = setInterval(() => {
    if (!AMBIENT.enabled) return;
    if (isUserSpeaking || isSpeaking) return; // don't classify our own / user voice
    const level = _currentAmbientLevel();
    _updateBaseline(level);
    if (AMBIENT.baselineSamples.length < 8) return; // warm-up
    const delta = level - AMBIENT.baselineRms;
    if (level > AMBIENT.spikeFloor && delta > AMBIENT.spikeDelta) {
      _onAmbientSpike(level);
    }
  }, 250);
  return true;
}

function stopAmbientListening() {
  if (!AMBIENT.enabled) return false;
  AMBIENT.enabled = false;
  if (AMBIENT.pollHandle) clearInterval(AMBIENT.pollHandle);
  AMBIENT.pollHandle = null;
  console.log('[Ambient] 👂 Ambient listening OFF');
  return true;
}

// One-shot: record 3s right now and tell the user what we hear.
async function whatDoYouHear() {
  if (AMBIENT.oneShotInflight) return;
  AMBIENT.oneShotInflight = true;
  isProcessing = true;
  ignoreAudio = true;
  updateStatus('PROCESSING');
  speakFiller('Tuning my ears, sir.');
  try {
    const { label, latencyMs } = await classifyAmbient(3000,
      'Listen to the audio clip. Identify what you hear in 2-8 words. ' +
      'Output ONLY a single line: FINAL: <description>. ' +
      'If it is mostly silence or background, output: FINAL: mostly silence');
    console.log(`[Ambient] one-shot ${latencyMs}ms: ${label}`);
    const reply = label
      ? `I hear ${label.replace(/^(it sounds like|i hear|it seems|sounds like)\s+/i, '')}.`
      : 'I cannot make out anything distinctive at the moment, sir.';
    conversationHistory.push({ role: 'user', content: '[ambient:listen]' });
    conversationHistory.push({ role: 'assistant', content: reply });
    handleAIResponse(reply);
  } catch (err) {
    const msg = `I couldn't make out the audio, sir. ${err.message}`;
    jarvisTextEl.textContent = msg;
    speakTTS(msg);
    finishSpeakingState();
  } finally {
    AMBIENT.oneShotInflight = false;
  }
}

window.jarvisAmbient = { start: startAmbientListening, stop: stopAmbientListening, whatDoYouHear, classifyAmbient, AMBIENT };

// ═══════════════════════════════════════════════════════════════════════════
// SENSORY MEMORY (Phase 4) — embed observations, recall on demand
// ═══════════════════════════════════════════════════════════════════════════
// Fire-and-forget memory writer. We deliberately don't await — embedding takes
// a few hundred ms and we don't want to slow the UX.
function rememberAsync(type, text, meta) {
  if (!text || typeof text !== 'string' || text.trim().length < 3) return;
  window.assistant.memoryAdd({ type, text, meta }).then(r => {
    if (r && r.success) console.log(`[Memory+] ${type} #${r.id} (total ${r.count}): ${text.substring(0, 60)}`);
    else console.warn('[Memory+] add failed:', r && r.error);
  }).catch(err => console.warn('[Memory+] add error:', err.message));
}

// Recall intent: "what was I doing earlier", "do you remember", "what was on my screen X minutes ago",
// "what did we talk about", "what was that sound earlier".
function detectRecallIntent(text) {
  const t = text.toLowerCase().trim();
  if (/\b(do you remember|recall|earlier|previously|a (?:few |couple of )?(?:minutes|hours) ago|just now|a moment ago|some time ago|before|last time)\b/.test(t)
      && /\b(what|when|where|who|how|why|did i|was i|were we|tell me|show me|did we|talk|discuss|hear|see|look|on (?:my|the) screen|sound|noise|happen)\b/.test(t)) {
    return { recall: true, query: text };
  }
  if (/\b(what (?:was|were) (?:on (?:my|the) screen|i (?:doing|working on)|that))\b/.test(t)) return { recall: true, query: text };
  if (/\b(memory stats|what do you remember|what's in your memory)\b/.test(t)) return { recall: 'stats' };
  return null;
}

// Compose a RAG context block from memory hits.
function _formatRecallContext(hits) {
  if (!hits || !hits.length) return null;
  const lines = hits.map(h => {
    const ago = h.ageSec < 60 ? `${h.ageSec}s ago`
              : h.ageSec < 3600 ? `${Math.round(h.ageSec / 60)}m ago`
              : `${Math.round(h.ageSec / 3600)}h ago`;
    return `• [${h.type}, ${ago}, sim=${h.sim}] ${h.text}`;
  });
  return `Relevant prior observations from sensory memory:\n${lines.join('\n')}`;
}

async function runRecall(userText) {
  isProcessing = true;
  ignoreAudio = true;
  updateStatus('PROCESSING');
  speakFiller('Searching memory, sir.');
  try {
    const res = await window.assistant.memoryQuery({ query: userText, k: 5, minScore: 0.1 });
    if (!res.success) throw new Error(res.error || 'memory query failed');

    const ctx = _formatRecallContext(res.hits);
    if (!ctx) {
      const reply = "I have no record of anything matching that, sir.";
      conversationHistory.push({ role: 'user', content: userText });
      conversationHistory.push({ role: 'assistant', content: reply });
      handleAIResponse(reply);
      return;
    }

    // RAG: feed memory context to the brain so it can synthesize a reply.
    const messages = [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'system', content: ctx },
      { role: 'user', content: userText },
    ];
    const llm = await window.assistant.nimChat({ messages, max_tokens: 350 });
    const reply = (llm.success && llm.reply) ? llm.reply : `Here's what I have, sir:\n${res.hits.map(h => '• ' + h.text).join('\n')}`;
    conversationHistory.push({ role: 'user', content: userText });
    conversationHistory.push({ role: 'assistant', content: reply });
    handleAIResponse(reply);
  } catch (err) {
    console.error('[Recall] Error:', err);
    const msg = `My memory subsystem appears unreachable, sir. ${err.message}`;
    jarvisTextEl.textContent = msg;
    speakTTS(msg);
    finishSpeakingState();
  }
}

async function speakMemoryStats() {
  const s = await window.assistant.memoryStats();
  const parts = Object.entries(s.byType || {}).map(([k, v]) => `${v} ${k}`);
  const reply = s.count
    ? `My sensory memory holds ${s.count} entries — ${parts.join(', ')}.`
    : 'My sensory memory is empty, sir.';
  isProcessing = true;
  conversationHistory.push({ role: 'assistant', content: reply });
  handleAIResponse(reply);
}

window.jarvisMemory = { remember: rememberAsync, recall: runRecall, stats: speakMemoryStats };

async function processInput(text) {
  if (isProcessing) {
    console.warn("[LLM] Already processing. Ignoring input.");
    return;
  }

  console.log(`[LLM] Processing Input: "${text}"`);
  if (!text.trim() || text.length < 2) {
    console.warn("[LLM] Terminating: Empty or trivial text.");
    return;
  }

  // ── RECALL INTENT (sensory memory RAG) ──
  const recall = detectRecallIntent(text);
  if (recall) {
    cmdsExecuted++;
    cmdsPillCount.textContent = cmdsExecuted;
    if (recall.recall === 'stats') { speakMemoryStats(); return; }
    await runRecall(text);
    return;
  }

  // ── SENSORY INTENT (vision / camera / ambient / toggles) ──
  const intent = detectVisionIntent(text);
  if (intent) {
    if (intent.source === 'control') {
      let reply;
      switch (intent.op) {
        case 'watch-start':   reply = startScreenWatch(30) ? 'Continuous screen monitoring engaged, sir.' : 'I am already watching your screen, sir.'; break;
        case 'watch-stop':    reply = stopScreenWatch() ? 'Screen monitoring disengaged.' : 'Screen monitoring was not active, sir.'; break;
        case 'ambient-start': reply = startAmbientListening() ? 'Ambient listening online — I will alert you to anything notable.' : 'Ambient listening is already active, sir.'; break;
        case 'ambient-stop':  reply = stopAmbientListening() ? 'Ambient listening disengaged, sir.' : 'Ambient listening was not active, sir.'; break;
        default:              reply = 'Acknowledged, sir.';
      }
      conversationHistory.push({ role: 'user', content: text });
      conversationHistory.push({ role: 'assistant', content: reply });
      isProcessing = true;
      handleAIResponse(reply);
      return;
    }
    if (intent.source === 'ambient') {
      cmdsExecuted++;
      cmdsPillCount.textContent = cmdsExecuted;
      await whatDoYouHear();
      return;
    }
    cmdsExecuted++;
    cmdsPillCount.textContent = cmdsExecuted;
    await runVisionQuery({ source: intent.source, prompt: intent.prompt });
    return;
  }

  // ── TRY LOCAL RESPONSE FIRST (No API needed) ──
  const localReply = tryLocalResponse(text);
  if (localReply) {
    console.log(`[LLM] Local Response Match: "${localReply}"`);
    isProcessing = true;
    cmdsExecuted++;
    cmdsPillCount.textContent = cmdsExecuted;
    conversationHistory.push({ role: 'user', content: text });
    conversationHistory.push({ role: 'assistant', content: localReply });
    if (conversationHistory.length > 50) conversationHistory.shift();
    handleAIResponse(localReply);
    return;
  }

  // ── NO LOCAL MATCH → CALL APIs ──
  isProcessing = true;
  ignoreAudio = true;
  updateStatus('PROCESSING');
  
  // Play filler audio to mask latency
  const filler = FILLER_PHRASES[Math.floor(Math.random() * FILLER_PHRASES.length)];
  jarvisTextEl.textContent = filler;
  speakFiller(filler);

  cmdsExecuted++;
  cmdsPillCount.textContent = cmdsExecuted;

  conversationHistory.push({ role: 'user', content: text });

  try {
    // ── UPDATE MEMORY & REBUILD PROMPT ──
    extractAndStoreFacts(text);
    SYSTEM_PROMPT = buildSystemPrompt();

    // ── BUILD MESSAGES ──
    const baseMessages = conversationHistory.map(m => ({ role: m.role, content: m.content }));
    const orMessages = [
      { role: 'system', content: SYSTEM_PROMPT },
      ...conversationHistory.map(m => {
        const msg = { role: m.role, content: m.content };
        if (m.role === 'assistant' && m.reasoning_details) {
          msg.reasoning_details = m.reasoning_details;
        }
        return msg;
      })
    ];

    // ── STEP 1: FAST TOOL ROUTING (Groq) ──
    // Groq is sub-500ms. We use it for intent detection and tool calling.
    const groqResult = await window.assistant.groqChat([{ role: 'system', content: SYSTEM_PROMPT }, ...baseMessages])
      .catch(err => ({ success: false, error: err.message }));

    if (groqResult.success && groqResult.reply) {
      const replyTrimmed = groqResult.reply.trim();
      
      // If Groq identifies a tool call, execute and respond immediately
      if (replyTrimmed.startsWith('{') && (replyTrimmed.includes('"action"') || replyTrimmed.includes('"success"'))) {
        console.log(`[LLM] Fast-Path Tool Detected: ${replyTrimmed.substring(0, 50)}...`);
        
        // Execute tool context via OpenRouter for the "final" conversational response
        const toolMessages = [...orMessages, { role: 'user', content: `[Tool Intent Detected]: ${replyTrimmed}\nExecute the tool and give a very brief confirmation.` }];
        const toolOrResult = await window.assistant.geminiChat(toolMessages); // Switch to Gemini Flash for speed
        
        if (toolOrResult.success && toolOrResult.reply) {
          handleAIResponse(toolOrResult.reply);
          conversationHistory.push({ role: 'assistant', content: toolOrResult.reply });
          return;
        }
        
        // Final fallback for tools: just use Groq's reply
        handleAIResponse(groqResult.reply);
        return;
      }
    }

    // ── STEP 2: CONVERSATIONAL RESPONSE (NVIDIA NIM — primary brain) ──
    const nimMessages = [{ role: 'system', content: SYSTEM_PROMPT }, ...orMessages];
    const nimResult = await window.assistant.nimChat({ messages: nimMessages })
      .catch(err => ({ success: false, error: err.message }));

    if (nimResult.success && nimResult.reply) {
      const reply = nimResult.reply;
      console.log(`[LLM] NIM (${nimResult.model}) ${nimResult.latencyMs}ms: ${reply.substring(0, 100)}...`);
      conversationHistory.push({ role: 'assistant', content: reply });
      rememberAsync('conversation', `User: ${text}\nJarvis: ${reply}`);
      handleAIResponse(reply);
      return;
    }
    console.warn(`[LLM] NIM failed (${nimResult.error}), falling back to Gemini.`);

    // ── STEP 3: FALLBACK (Gemini Flash) ──
    const geminiResult = await window.assistant.geminiChat(orMessages)
      .catch(err => ({ success: false, error: err.message }));

    if (geminiResult.success && geminiResult.reply) {
      const reply = geminiResult.reply;
      console.log(`[LLM] Gemini Flash Response: ${reply.substring(0, 100)}...`);
      conversationHistory.push({ role: 'assistant', content: reply });
      handleAIResponse(reply);
      return;
    }

    // ── STEP 4: FALLBACK (OpenRouter/Gemma) ──
    const orResult = await window.assistant.openRouterChat({ messages: orMessages, useReasoning: false });
    if (orResult.success && orResult.reply) {
      handleAIResponse(orResult.reply);
      return;
    }

    throw new Error(`All engines failed.`);
  } catch (e) {
    console.error("[LLM] Process error:", e);
    const ERROR_PHRASES = [
      "Sir, it appears the mainland server monkeys have gone on strike. I can still handle basic local functions if you need.",
      "My connection to the global network is currently experiencing a rapid unscheduled disassembly. Local core is still online, however.",
      "It seems the API bandwidth is fully exhausted. Probably someone downloading too many cat videos. I am restricted to local protocols.",
      "I'm afraid my cloud servers are temporarily offline. I'm currently running on emergency backup power, sir. What local task can I assist with?",
      "Sir, I am unable to connect to the central mainframe. I suspect a villainous plot, but until it's resolved, I am limited to local knowledge.",
      "My neural links to the external world are presently severed. Someone must have tripped over the wire. My local systems remain fully operational though.",
      "Apologies, sir, but my global cognition engine is tapped out. Let's stick to the basics until the network stabilizes."
    ];
    
    let userMsg = ERROR_PHRASES[Math.floor(Math.random() * ERROR_PHRASES.length)];

    jarvisTextEl.textContent = userMsg; 
    speakTTS(userMsg);
    finishSpeakingState();
  }
}

function sanitizeOutput(text) {
  if (!text) return "";
  // Remove JSON blocks {...}
  let clean = text.replace(/\{[\s\S]*?\}/g, '').trim();
  // Remove XML-like tags <function=...>...</function> or any <...> tags
  clean = clean.replace(/<[\s\S]*?>/g, '').trim();
  // If we ended up with nothing, provide a fallback
  return clean || "I'm processing that now, sir. What's next?";
}

function handleAIResponse(reply) {
  const cleanReply = sanitizeOutput(reply);
  jarvisTextEl.textContent = cleanReply;
  isProcessing = false;
  speakTTS(cleanReply);
}

// ═══════════════════════════════════════════════════════════════════════════
// TEXT-TO-SPEECH (DUAL ENGINE: GROQ ORPHEUS + WEB SPEECH API)
// ═══════════════════════════════════════════════════════════════════════════

// Voice configuration consolidated at top of file




function cancelPlayback() {
  if (isSpeaking || isProcessing) {
    console.log("[Speech] Canceling playback and processing state due to interruption.");
    window.speechSynthesis.cancel();
    if (window.currentJARVISAudio) {
      window.currentJARVISAudio.pause();
      window.currentJARVISAudio.currentTime = 0;
    }
    finishSpeakingState();
  }
}

function finishSpeakingState() {
  isSpeaking = false;
  isProcessing = false;
  ignoreAudio = false;
  
  if (autoListen) {
    updateStatus('LISTENING');
    if (!isListening) startListening();
    resetSleepTimer();
  } else {
    updateStatus('OFFLINE');
  }
}

async function speakTTS(text) {
  if (!text) {
    ignoreAudio = false;
    updateStatus(isAwake ? 'LISTENING' : 'SLEEPING');
    resetSleepTimer();
    return;
  }

  await waitForUser();

  // USE SARVAM TTS (with automatic fallback to Groq/Web)
  speakSarvamTTS(text);
}

async function speakSarvamTTS(text) {
  isSpeaking = true;
  ignoreAudio = true;
  updateStatus('SPEAKING');

  try {
    console.log('[Sarvam TTS] Requesting speech generation...');
    window.lastSpokenText = text;
    const result = await window.assistant.sarvamTTS(text);

    if (!result.success) throw new Error(result.error || 'Sarvam TTS failed');

    // Convert base64 WAV to playable audio
    const audioData = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
    const blob = new Blob([audioData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);
    window.currentJARVISAudio = audio;

    audio.onended = () => {
      URL.revokeObjectURL(url);
      window.currentJARVISAudio = null;
      finishSpeakingState();
    };

    audio.onerror = (err) => {
      console.warn('[Sarvam TTS] Audio playback error, falling back to Groq...', err);
      URL.revokeObjectURL(url);
      window.currentJARVISAudio = null;
      speakGroqTTS(text);
    };
  } catch (err) {
    console.warn('[Sarvam TTS] Failed, falling back to Groq...', err);
    speakGroqTTS(text);
  }
}

async function speakGroqTTS(text) {
  isSpeaking = true;
  ignoreAudio = true;
  updateStatus('SPEAKING');

  try {
    console.log('[Groq TTS] Requesting speech generation...');
    const result = await window.assistant.groqTTS(text);

    if (!result.success) {
      if (result.error && result.error.includes('429')) {
        console.error('[Groq TTS] Rate limit reached. Falling back to local synthesis.');
        jarvisTextEl.textContent += " (TTS Rate Limited - Using local voice)";
      }
      throw new Error(result.error || 'Groq TTS failed');
    }

    // Convert base64 WAV to playable audio
    const audioData = Uint8Array.from(atob(result.audio), c => c.charCodeAt(0));
    const blob = new Blob([audioData], { type: 'audio/wav' });
    const url = URL.createObjectURL(blob);
    const audio = new Audio(url);

    audio.onended = () => {
      URL.revokeObjectURL(url);
      finishSpeakingState();
    };

    audio.onerror = (err) => {
      console.warn('[Groq TTS] Audio playback error, falling back...', err);
      URL.revokeObjectURL(url);
      speakWebTTS(text);
    };

    await audio.play();
    console.log('[Groq TTS] Playing Orpheus audio.');

  } catch (err) {
    console.warn('[Groq TTS] Failed, falling back to Web Speech...', err);
    speakWebTTS(text);
  }
}

async function speakWebTTS(text) {
  window.lastSpokenText = text;
  window.speechSynthesis.cancel();

  const utt = new SpeechSynthesisUtterance(text);
  utt.rate = 1.0;
  utt.pitch = 1.0;

  const v = await pickVoice();
  if (v) utt.voice = v;
  else console.warn('[TTS] No matching voice found, using system default.');

  utt.onstart = () => {
    console.log('[TTS] Speech Started.');
    isSpeaking = true;
    ignoreAudio = true;
    updateStatus('SPEAKING');
  };

  utt.onend = finishSpeakingState;
  utt.onerror = () => finishSpeakingState();

  window.speechSynthesis.speak(utt);
}

// Backup startup hook
setTimeout(() => {
  if (autoListen && !isListening) startListening();
}, 2000);
