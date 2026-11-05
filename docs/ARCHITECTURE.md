# Avatar AI - Architecture

> Animated AI companion with persistent memory, local LLM, and visual presence.

---

## Overview

```
┌─────────────────────────────────────────────────────────────────────┐
│                        FRONTEND (Browser)                           │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐  ┌────────────┐ │
│  │  Live2D     │  │  Voice      │  │  Chat       │  │  Memory    │ │
│  │  Avatar     │  │  Controls   │  │  Interface  │  │  Viewer    │ │
│  │  (PixiJS)   │  │  (Mic/Spkr) │  │  (Optional) │  │  (KB)      │ │
│  └──────┬──────┘  └──────┬──────┘  └──────┬──────┘  └─────┬──────┘ │
│         │                │                │                │        │
│         └────────────────┴────────────────┴────────────────┘        │
│                                   │                                  │
│                          WebSocket / REST                            │
└───────────────────────────────────┼──────────────────────────────────┘
                                    │
┌───────────────────────────────────┼──────────────────────────────────┐
│                        BACKEND (Python/Node)                         │
│                                   │                                  │
│  ┌────────────────────────────────┼────────────────────────────────┐ │
│  │                    Conversation Engine                          │ │
│  │  ┌─────────┐  ┌─────────┐  ┌─────────┐  ┌─────────┐            │ │
│  │  │  STT    │→ │  LLM    │→ │  TTS    │→ │ Lip Sync│            │ │
│  │  │ Whisper │  │ Ollama  │  │ 11Labs  │  │  Data   │            │ │
│  │  └─────────┘  └─────────┘  └─────────┘  └─────────┘            │ │
│  └─────────────────────────────────────────────────────────────────┘ │
│                                   │                                  │
│  ┌─────────────────────────────────────────────────────────────────┐ │
│  │                    Memory System                                 │ │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐             │ │
│  │  │  Short-term │  │  Long-term  │  │  Knowledge  │             │ │
│  │  │  (Session)  │  │  (ChromaDB) │  │  (Markdown) │             │ │
│  │  └─────────────┘  └─────────────┘  └─────────────┘             │ │
│  └─────────────────────────────────────────────────────────────────┘ │
└──────────────────────────────────────────────────────────────────────┘
                                    │
┌───────────────────────────────────┼──────────────────────────────────┐
│                        LOCAL SERVICES                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                  │
│  │   Ollama    │  │  ChromaDB   │  │  Whisper    │                  │
│  │ localhost:  │  │ localhost:  │  │  (or API)   │                  │
│  │   11434     │  │   8000      │  │             │                  │
│  └─────────────┘  └─────────────┘  └─────────────┘                  │
└──────────────────────────────────────────────────────────────────────┘
```

---

## Components

### 1. Frontend (Live2D Agent Enhanced)

Based on the live2d-agent demo, extended with:

| Feature | Implementation |
|---------|----------------|
| Live2D Avatar | PixiJS + pixi-live2d-display |
| Voice Input | Web Audio API → WebSocket stream |
| Voice Output | Audio playback + lip sync injection |
| Chat UI | Optional text interface |
| Memory Viewer | Browse/search knowledge base |

### 2. Backend Services

#### Conversation Engine

```
User Voice → STT → LLM (+ Memory Context) → TTS → Avatar Response
```

| Stage | Options |
|-------|---------|
| **STT** | Whisper (local), Deepgram, Web Speech API |
| **LLM** | Ollama (Llama 3.1, Qwen, Mistral), Claude API fallback |
| **TTS** | ElevenLabs, Chatterbox (local), Edge TTS |
| **Lip Sync** | Audio amplitude → mouth parameter mapping |

#### Memory System (Inspired by DeepWiki)

Three-tier memory architecture:

**Tier 1: Session Memory**
- Current conversation context
- Sliding window of recent exchanges
- Stored in-memory, cleared on session end

**Tier 2: Long-term Memory (Vector DB)**
- Conversation summaries
- Important facts extracted from conversations
- Embeddings stored in ChromaDB
- Queried via semantic search on each turn

**Tier 3: Knowledge Base (Markdown)**
- Structured documents (like deepwiki)
- Hash-based staleness tracking
- Categories: personal facts, preferences, projects, people
- Git-versioned, human-readable

```
.memory/
├── memory.json          # Index with hashes
├── conversations/       # Summarized past conversations
│   ├── 2026-08-13.md
│   └── ...
├── facts/               # Extracted facts
│   ├── personal.md
│   ├── preferences.md
│   └── projects.md
├── people/              # People mentioned
│   └── ...
└── embeddings/          # ChromaDB data
```

### 3. Provider Abstraction

Swap providers without code changes:

```typescript
interface STTProvider {
  transcribe(audio: Blob): Promise<string>;
}

interface LLMProvider {
  chat(messages: Message[], context?: string): Promise<string>;
}

interface TTSProvider {
  synthesize(text: string, voice?: string): Promise<Blob>;
}

// Implementations
class OllamaLLM implements LLMProvider { ... }
class ClaudeLLM implements LLMProvider { ... }
class ElevenLabsTTS implements TTSProvider { ... }
class ChatterboxTTS implements TTSProvider { ... }
```

---

## Data Flow

### Voice Conversation

```
1. User speaks into mic
2. Web Audio API captures audio chunks
3. WebSocket streams to backend
4. Whisper transcribes to text
5. Memory system retrieves relevant context
6. Ollama generates response (with context)
7. Memory system extracts & stores new facts
8. ElevenLabs synthesizes speech
9. Audio sent to frontend
10. Live2D avatar lip-syncs to audio
```

### Memory Extraction (Post-conversation)

```
1. Conversation ends or reaches checkpoint
2. LLM summarizes conversation
3. LLM extracts facts (structured JSON)
4. Facts merged into .memory/ markdown files
5. Embeddings updated in ChromaDB
6. memory.json index updated with new hashes
```

---

## API Endpoints

```
POST /api/conversation/start     # Initialize session
POST /api/conversation/message   # Send text message
WS   /api/conversation/stream    # Real-time voice stream

GET  /api/memory/search          # Semantic search memories
GET  /api/memory/facts           # List all facts
POST /api/memory/add             # Manually add memory
GET  /api/memory/status          # Staleness check (like deepwiki)

GET  /api/providers              # List available providers
POST /api/providers/switch       # Change active provider
```

---

## Configuration

```yaml
# config.yaml
providers:
  stt:
    active: whisper
    whisper:
      model: base.en
  llm:
    active: ollama
    ollama:
      model: llama3.1:8b
      base_url: http://localhost:11434
    claude:
      model: claude-sonnet-4-20250514
  tts:
    active: elevenlabs
    elevenlabs:
      voice_id: pNInz6obpgDQGcFmaJgB
    chatterbox:
      model: default

memory:
  session_window: 20          # Messages to keep in context
  extraction_interval: 10     # Extract facts every N messages
  embedding_model: nomic-embed-text

avatar:
  default_model: shizuku
  lip_sync_sensitivity: 0.7
```

---

## Tech Stack

| Layer | Technology |
|-------|------------|
| Frontend | TypeScript, PixiJS, pixi-live2d-display, Vite |
| Backend | Python (FastAPI) or Node (Express) |
| LLM | Ollama, Claude API |
| TTS | ElevenLabs API, Chatterbox |
| STT | Whisper (local or API) |
| Vector DB | ChromaDB |
| Memory Format | Markdown + JSON (deepwiki-style) |

---

## Roadmap

### Phase 1: Core Integration
- [ ] Connect Live2D to backend WebSocket
- [ ] Integrate Ollama for responses
- [ ] Add ElevenLabs TTS
- [ ] Basic lip sync from audio

### Phase 2: Memory System
- [ ] Session memory (sliding window)
- [ ] Conversation summarization
- [ ] Fact extraction
- [ ] Markdown storage with hashes

### Phase 3: Vector Search
- [ ] ChromaDB integration
- [ ] Semantic memory retrieval
- [ ] Context injection into prompts

### Phase 4: Polish
- [ ] Multiple avatar models
- [ ] Voice cloning (Chatterbox)
- [ ] Memory viewer UI
- [ ] Provider switching UI
