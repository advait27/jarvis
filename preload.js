const { contextBridge, ipcRenderer } = require('electron');

contextBridge.exposeInMainWorld('assistant', {
  // Wake Up UI
  wakeUp: () => ipcRenderer.send('wake-up'),

  // Unified command handler for all actions
  runCommand: (data) => ipcRenderer.invoke('run-command', data),

  // Groq Text-to-Speech
  groqTTS: (text) => ipcRenderer.invoke('groq-tts', text),

  // Sarvam Text-to-Speech
  sarvamTTS: (text) => ipcRenderer.invoke('sarvam-tts', text),

  // NIM (NVIDIA build) — primary brain, vision, health-check
  nimChat: (payload) => ipcRenderer.invoke('nim-chat', payload),
  nimVision: (payload) => ipcRenderer.invoke('nim-vision', payload),
  nimAudio: (payload) => ipcRenderer.invoke('nim-audio', payload),
  nimPing: () => ipcRenderer.invoke('nim-ping'),

  // Sensory capture
  captureScreen: (opts) => ipcRenderer.invoke('capture-screen', opts || {}),
  listScreenSources: () => ipcRenderer.invoke('list-screen-sources'),

  // Sensory memory
  memoryAdd: (payload) => ipcRenderer.invoke('memory-add', payload),
  memoryQuery: (payload) => ipcRenderer.invoke('memory-query', payload),
  memoryStats: () => ipcRenderer.invoke('memory-stats'),
  memoryClear: () => ipcRenderer.invoke('memory-clear'),

  // Groq Chat Completions
  groqChat: (messages) => ipcRenderer.invoke('groq-chat', messages),

  // Gemini Chat (Persona)
  geminiChat: (messages) => ipcRenderer.invoke('gemini-chat', messages),

  // OpenRouter Chat (Gemma 4 + Reasoning)
  openRouterChat: (payload) => ipcRenderer.invoke('openrouter-chat', payload),

  // Groq Speech-to-Text (Whisper)
  groqSTT: (buffer) => ipcRenderer.invoke('groq-stt', buffer),

  // Sarvam Speech-to-Text
  sarvamSTT: (buffer) => ipcRenderer.invoke('sarvam-stt', buffer),

  // Listen for timer completions
  onTimerDone: (callback) => {
    ipcRenderer.on('timer-done', (_event, label) => callback(label));
  },

  // Window controls
  minimizeWindow: () => ipcRenderer.send('minimize-window'),
  maximizeWindow: () => ipcRenderer.send('maximize-window'),
  closeWindow: () => ipcRenderer.send('close-window'),

  // Permissions
  requestMicPermission: () => ipcRenderer.invoke('request-mic-permission'),
  
  // MCP Tool Execution
  callTool: (toolName, args) => ipcRenderer.invoke('mcp-tool', toolName, args),

  // Environment Variables
  getEnv: (key) => ipcRenderer.invoke('get-env', key),
});
