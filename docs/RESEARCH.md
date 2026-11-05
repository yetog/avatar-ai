# Avatar AI - Research & Analysis Document

> Last Updated: 2026-08-16
> Sprint: 3 (Post-MVP Analysis)

---

## Current State Assessment

### What We Have Built

| Component | Status | Notes |
|-----------|--------|-------|
| Live2D Avatar Display | Working | Shizuku model via CDN |
| Voice Conversation | Working | ElevenLabs Conversational AI SDK |
| Lip Sync | Basic | Random values, not audio-synced |
| Backend API | Built, Not Used | FastAPI with providers + memory |
| Memory System | Built, Not Used | 3-tier: session, vector, knowledge |
| Model Selector | Built in app.js | 5 models defined, not in index.html |
| Chat UI | Built in app.js | Not in current index.html |

### Architecture Discovery

We discovered the codebase has two parallel implementations:

1. **index.html (current)** - Minimal inline script, uses ElevenLabs SDK directly
2. **src/js/app.js (unused)** - Full-featured ES6 module with all planned features

The full `app.js` includes:
- 5 avatar models (Shizuku, Haru, Hijiki, Tororo, Koharu)
- Model selector UI
- Chat panel with transcript
- Web Audio API lip sync (actual audio analysis)
- Loading overlay
- Keyboard shortcuts

### Backend Capabilities (Not Yet Connected)

```
FastAPI Backend (main.py)
├── /api/chat              POST   Text chat with optional audio response
├── /api/ws/conversation   WS     Real-time streaming
├── /api/session/start     POST   Start session with memory
├── /api/session/{id}/end  POST   End session, extract facts
├── /api/memory/stats      GET    Memory statistics
├── /api/memory/facts      GET    List learned facts
├── /api/memory/search     POST   Semantic search memories
└── /api/providers         GET    List available providers
```

**Provider System:**
- LLM: Ollama (local) or Claude (API)
- TTS: ElevenLabs
- STT: Whisper (planned)

**Memory System:**
- Session: Last 20 messages sliding window
- Long-term: ChromaDB vector embeddings
- Knowledge: Markdown files with hash-based tracking

---

## Gap Analysis

### What's Missing vs. Vision

| Feature | Current | Needed |
|---------|---------|--------|
| Real lip sync | Random values | Web Audio API frequency analysis |
| Multiple avatars | Hardcoded Shizuku | Model selector from app.js |
| Memory/context | None | Connect to backend memory system |
| Personality | None | System prompts per character |
| Emotions | None | Sentiment → expression mapping |
| Text input | None | Chat panel from app.js |
| Offline mode | No | Ollama for local LLM |

### Technical Debt

1. **Webpack bundles empty** - `bundle.js` and `elevenlabs.js` are 0 bytes, need `npm run build`
2. **Duplicate code** - index.html inline vs app.js module
3. **Backend not running** - FastAPI server not started/deployed
4. **No CI/CD** - Manual deployment only

---

## Open Source Ecosystem Research

### Live2D Alternatives

| Project | License | Pros | Cons |
|---------|---------|------|------|
| [Inochi2D](https://github.com/Inochi2D/inochi2d) | BSD-2 | Fully open, no restrictions | Fewer models available |
| [pixi-live2d-display](https://github.com/guansss/pixi-live2d-display) | MIT | What we use, works well | Depends on Cubism SDK |
| Live2D Cubism | Proprietary | Industry standard | Commercial license required for revenue |

### Reference Projects

| Project | What We Can Learn |
|---------|-------------------|
| [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber) | Full voice+LLM+Live2D integration, free models, architecture |
| [VTube Studio](https://denchisoft.com/) | UX patterns for VTuber apps |
| [Inochi Session](https://github.com/Inochi2D/inochi-session) | Open source VTuber tracking |

### Free Model Sources

1. **Open-LLM-VTuber models** - https://github.com/Open-LLM-VTuber/Open-LLM-VTuber/tree/main/live2d-models
2. **Live2D Sample Models** - Official free samples (Haru, Hiyori, Mark, Natori)
3. **GitHub live2d-models topic** - Community collections
4. **Booth.pm** - Japanese marketplace (some free, most $5-50)
5. **nizima.com** - Official Live2D marketplace

---

## Technical Deep Dive

### How Live2D Works

```
Layered PSD Artwork
       ↓
Mesh Deformation Rigging (Cubism Editor)
       ↓
.model3.json (Cubism 4) or .model.json (Cubism 2)
       ↓
Parameters: ParamEyeOpenL, ParamMouthOpenY, ParamBodyAngleX, etc.
       ↓
Runtime: Set parameter values → Mesh deforms → Illusion of 3D movement
```

**Key Parameters for Expression:**
- `ParamMouthOpenY` - Mouth open/close (lip sync)
- `ParamEyeLOpen/R` - Eye open/close (blink)
- `ParamBrowLY/RY` - Eyebrow position (emotion)
- `ParamBodyAngleX/Y/Z` - Body rotation (movement)
- `ParamAngleX/Y/Z` - Head rotation (look direction)

### Real Lip Sync Implementation

**Current (Random):**
```javascript
smoothedVolume = 0.4 + Math.random() * 0.6;
model.setParamFloat(mouthIndex, smoothedVolume);
```

**Proper (Audio Analysis):**
```javascript
// Create audio context and analyser
const audioContext = new AudioContext();
const analyser = audioContext.createAnalyser();
analyser.fftSize = 256;

// Connect audio source to analyser
const source = audioContext.createMediaElementSource(audioElement);
source.connect(analyser);
analyser.connect(audioContext.destination);

// Get frequency data
const dataArray = new Uint8Array(analyser.frequencyBinCount);
analyser.getByteFrequencyData(dataArray);

// Calculate average volume (lower frequencies = speech)
const speechBins = dataArray.slice(0, 20); // ~0-860Hz
const volume = speechBins.reduce((a, b) => a + b) / speechBins.length / 255;

model.setParamFloat(mouthIndex, volume);
```

### ElevenLabs Conversational AI SDK

**What we're using:**
```javascript
import { Conversation } from '@elevenlabs/client';

const conversation = await Conversation.startSession({
    signedUrl,
    onConnect: () => {},
    onDisconnect: () => {},
    onModeChange: (mode) => {},  // 'listening' | 'speaking'
    onMessage: (msg) => {},
    onError: (err) => {}
});
```

**What we're missing:**
- No access to raw audio stream for analysis
- Mode change is only indicator of speaking state
- Could potentially tap into internal audio handling

**Alternative approach:**
- Use ElevenLabs streaming TTS API directly
- Get audio chunks as they arrive
- Analyze each chunk with Web Audio API
- More control but more complexity

---

## Architecture Recommendations

### Option A: Enhance Current (index.html)

Pros: Working now, minimal changes
Cons: Misses backend features, code duplication

```
index.html (inline) → ElevenLabs SDK → Voice Assistant signed-url
                   → Live2D Display → CDN Models
```

### Option B: Use Full App (app.js)

Pros: Already has features, cleaner architecture
Cons: Needs webpack build, may have bugs

```
index.html → bundle.js (webpack) → app.js modules
          → ElevenLabs SDK
          → Live2D Display
          → Web Audio API
```

### Option C: Full Stack Integration

Pros: Memory, multiple LLMs, full control
Cons: Need to run backend, more complexity

```
Frontend (index.html)
    ↓ WebSocket
Backend (FastAPI)
    ├── Ollama (local) or Claude (cloud)
    ├── ElevenLabs TTS
    ├── Memory System
    └── Whisper STT
```

### Recommended: Hybrid Approach

1. **Keep index.html simple** for voice-only experience
2. **Port features from app.js** incrementally (models, chat)
3. **Add backend later** for memory/persistence
4. **Use ElevenLabs SDK** for voice (already works)

---

## Next Steps (Prioritized)

### Phase 2: Polish Current MVP
- [ ] Fix lip sync with simple volume detection from mode changes
- [ ] Add 2-3 more models (use URLs from app.js)
- [ ] Add model selector dropdown
- [ ] Hide debug log (toggle button)
- [ ] Mobile-responsive layout

### Phase 3: Real Lip Sync
- [ ] Research ElevenLabs SDK internals for audio access
- [ ] Implement Web Audio API analysis if accessible
- [ ] Fall back to improved timing-based animation

### Phase 4: Companion Features
- [ ] Start backend service
- [ ] Connect to memory system
- [ ] Add text input option
- [ ] Implement personality prompts per character
- [ ] Daily greeting based on time

### Phase 5: Character Ecosystem
- [ ] Integrate free models from Open-LLM-VTuber
- [ ] Create character profiles (voice + personality)
- [ ] Background scenes per character
- [ ] Emotion expressions from sentiment

---

## Questions to Resolve

1. **ElevenLabs audio access** - Can we tap into SDK's audio for analysis?
2. **Model licensing** - Which free models can we legally use?
3. **Backend deployment** - Docker? Systemd? Port allocation?
4. **Memory persistence** - Local storage vs. server-side?
5. **Voice cloning** - Create custom voices for characters?

---

## Open Source Ecosystem Deep Dive

### Open-LLM-VTuber

**Repository:** [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)

**Key Findings:**
- Migrated from pixi-live2d-display to official Live2D Web SDK (v1.2.0+)
- Dropped Cubism 2 support (only Cubism 5 now)
- Uses **expression keywords in LLM response** to control facial expressions
- Expression keywords auto-loaded into system prompt, excluded from TTS
- Desktop pet mode with transparent background

**Architecture:**
- Python backend with `uv` package manager
- Electron + React + TypeScript frontend (separate repo)
- Supports 9+ LLM providers, 9+ ASR engines, 10+ TTS engines

**Lesson:** They moved away from audio-based lip sync to expression keywords. Simpler but less realistic.

---

### Prometheus Avatar SDK

**Repository:** [prometheus-avatar](https://github.com/myths-labs/prometheus-avatar)

**Key Findings:**
- Clean SDK with `@prometheusavatar/core` npm package
- Modular components: Live2DRenderer, LipSyncEngine, EmotionAnalyzer
- Supports Cubism 2 & 4
- Simple API: `avatar.speak('Hello! 😊')`
- Emotion detection from text sentiment

**Architecture:**
```
PrometheusAvatar (orchestrator)
├── Live2DRenderer (PIXI.js)
├── LipSyncEngine (audio → mouth)
├── EmotionAnalyzer (text → emotion)
└── WebSpeechTTS
```

**Integration Options:**
- NPM SDK for custom apps
- MCP Server for Claude/GPT
- HTTP skill for agents

**Lesson:** Well-architected SDK we could potentially use or learn from.

---

### Lipsync Engine (Standalone)

**Repository:** [lipsync-engine](https://github.com/Amoner/lipsync-engine)

**Key Findings:**
- Zero-dependency (~15KB)
- AudioWorklet + Web Audio API
- Real-time viseme detection via FFT
- Emits frame data with `{open, width, round}` parameters

**API:**
```javascript
const engine = new LipSyncEngine({ sampleRate: 24000 });
await engine.init();
engine.feedAudio(audioData);  // Feed PCM data
engine.on('viseme', frame => {
    // frame.shape = {open: 0.5, width: 0.3, round: 0.2}
    model.setMouthOpen(frame.shape.open);
});
```

**Compatibility:** Chrome 66+, Firefox 76+, Safari 14.1+

**Lesson:** Could integrate this for proper audio-driven lip sync.

---

### pixi-live2d-display-lip-sync Fork

**Repository:** [pixi-live2d-display-lip-sync](https://github.com/zhaoyin0226/pixi-live2d-display-lip-sync)

**Key Findings:**
- Fork of pixi-live2d-display with built-in lip sync
- Adds `model.speak(audioUrl)` method
- Supports both Cubism 2 and Cubism 4
- Handles audio loading and mouth sync automatically

**API:**
```javascript
// Simple lip sync from audio URL
model.speak('/audio/response.mp3', {
    volume: 1.0,
    onFinish: () => console.log('done'),
    crossOrigin: 'anonymous'
});

// Or with motion
model.motion('idle', 0, 2, {
    sound: '/audio/response.mp3'
});
```

**Lesson:** Drop-in replacement for pixi-live2d-display that solves lip sync.

---

## Lip Sync Strategy Comparison

| Approach | Complexity | Accuracy | ElevenLabs Compatible |
|----------|------------|----------|----------------------|
| **Random values** (current) | Low | Poor | Yes |
| **Mode-based timing** | Low | Fair | Yes |
| **pixi-live2d-display-lip-sync** | Low | Good | Need audio URL |
| **lipsync-engine** | Medium | Excellent | Need raw audio |
| **Expression keywords** (Open-LLM-VTuber) | Medium | N/A | Yes |

### Challenge with ElevenLabs Conversational AI SDK

The SDK handles audio internally - we don't have access to:
- Raw audio stream (PCM data)
- Audio element reference
- Audio URL

**Options:**
1. Use mode-based animation (what we have now, improved timing)
2. Switch to ElevenLabs Streaming TTS API (get audio chunks)
3. Use expression keywords approach (no audio sync)
4. Intercept SDK audio somehow (hacky)

---

## Resources

- [pixi-live2d-display docs](https://github.com/guansss/pixi-live2d-display)
- [pixi-live2d-display-lip-sync](https://github.com/zhaoyin0226/pixi-live2d-display-lip-sync)
- [lipsync-engine](https://github.com/Amoner/lipsync-engine)
- [prometheus-avatar](https://github.com/myths-labs/prometheus-avatar)
- [ElevenLabs Conversational AI](https://elevenlabs.io/docs/conversational-ai/overview)
- [Open-LLM-VTuber](https://github.com/Open-LLM-VTuber/Open-LLM-VTuber)
- [Web Audio API](https://developer.mozilla.org/en-US/docs/Web/API/Web_Audio_API)
- [Live2D Parameter Reference](https://docs.live2d.com/cubism-sdk-manual/standardparameterlist/)
