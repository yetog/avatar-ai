# ComfyUI Integration Plan for Avatar AI

> Plan for integrating ComfyUI as the local AI generation backend for Avatar Studio.
> Created: 2026-08-26

---

## Overview

Replace cloud-dependent APIs (Leonardo AI) with a self-hosted ComfyUI instance running on Mac Mini. This gives full control over generation, no API costs, and enables advanced workflows like animation.

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Avatar AI Frontend                       │
│                    (studio.html / app.html)                  │
└─────────────────────────┬───────────────────────────────────┘
                          │ HTTP API
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                   Avatar AI Backend (FastAPI)                │
│                      /api/avatars/*                          │
└─────────────────────────┬───────────────────────────────────┘
                          │ WebSocket/REST
                          ▼
┌─────────────────────────────────────────────────────────────┐
│                    ComfyUI Server                            │
│              (Mac Mini - localhost:8188)                     │
│                                                              │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐          │
│  │ Flux/SDXL   │  │ AnimateDiff │  │ SadTalker   │          │
│  │ Generation  │  │ Animation   │  │ Lip Sync    │          │
│  └─────────────┘  └─────────────┘  └─────────────┘          │
└─────────────────────────────────────────────────────────────┘
```

---

## Phase 1: ComfyUI Setup (Mac Mini)

### 1.1 Install ComfyUI Desktop

1. Download from [comfy.org/download](https://comfy.org/download)
2. Install the macOS version
3. Launch and verify it runs on MPS (Apple Silicon)

### 1.2 Install Required Models

Download and place in `ComfyUI/models/`:

| Model | Location | Purpose |
|-------|----------|---------|
| Flux.1 Dev | `checkpoints/` | High-quality image generation |
| SDXL 1.0 | `checkpoints/` | Fallback/faster generation |
| IP-Adapter FaceID | `ipadapter/` | Character consistency |
| AnimateDiff | `animatediff_models/` | Image-to-video animation |

### 1.3 Install Custom Nodes

Via ComfyUI Manager (`--enable-manager`):

```
Required:
- ComfyUI-AnimateDiff-Evolved    # Animation from still images
- ComfyUI-IPAdapter-Plus         # Character consistency
- ComfyUI-LivePortrait           # Real-time face animation
- comfyui-reactor-node           # Face swap/consistency
- ComfyUI-VideoHelperSuite       # Video processing
- ComfyUI-KJNodes                # Utility nodes

Optional (for advanced features):
- ComfyUI-SadTalker              # Audio-driven lip sync
- ComfyUI-RMBG                   # Background removal
- ComfyUI-LayerDiffuse           # Transparent backgrounds
```

### 1.4 Configure API Access

ComfyUI runs on `http://127.0.0.1:8188` by default.

For network access (if backend runs elsewhere):
```bash
python main.py --listen 0.0.0.0 --port 8188
```

---

## Phase 2: Workflow Design

### 2.1 Character Generation Workflow

**Input:** Text prompt + style preset + (optional) reference image
**Output:** Character portrait PNG with transparent background

```
Workflow Nodes:
1. CLIP Text Encode (positive/negative prompts)
2. KSampler (Flux or SDXL)
3. VAE Decode
4. LayerDiffuse (transparent bg) OR RMBG (remove bg)
5. Save Image
```

**Preset Prompts for Characters:**
```python
STYLE_PRESETS = {
    "anime": "anime style, cel shaded, vibrant colors, clean lines",
    "realistic": "photorealistic, detailed skin texture, studio lighting",
    "pixel": "pixel art style, 16-bit, retro game aesthetic",
    "cartoon": "cartoon style, bold outlines, flat colors, expressive",
}

CHARACTER_PRESETS = {
    "drzay": "african american male, early 30s, confident expression, casual streetwear, music producer aesthetic",
    "dante": "young male, streetwise look, relaxed confidence, urban style",
    "sasha": "young woman, artistic, creative energy, expressive eyes",
    "cora": "professional woman, warm demeanor, approachable, smart casual",
    "natasha": "elegant woman, mysterious, sophisticated, dark aesthetic",
}
```

### 2.2 Animation Workflow (AnimateDiff)

**Input:** Still character image
**Output:** Looping animation (idle, talking, gestures)

```
Workflow Nodes:
1. Load Image
2. AnimateDiff Loader
3. AnimateDiff Sampler
4. Video Combine (GIF or MP4)
```

**Motion Presets:**
```python
MOTION_PRESETS = {
    "idle": "subtle breathing, slight movement, blinking",
    "talking": "mouth movement, head nods, expressive",
    "excited": "energetic movement, gestures, dynamic",
    "thinking": "hand to chin, looking up, contemplative",
}
```

### 2.3 Lip Sync Workflow (SadTalker/LivePortrait)

**Input:** Character image + audio file
**Output:** Video with synced lip movement

```
Workflow Nodes:
1. Load Image (character face)
2. Load Audio
3. SadTalker/LivePortrait Node
4. Video Output
```

---

## Phase 3: Backend Integration

### 3.1 ComfyUI Client Module

Create `backend/lib/comfyui_client.py`:

```python
import aiohttp
import json
import uuid

class ComfyUIClient:
    def __init__(self, host: str = "127.0.0.1", port: int = 8188):
        self.base_url = f"http://{host}:{port}"
        self.client_id = str(uuid.uuid4())

    async def queue_prompt(self, workflow: dict) -> str:
        """Queue a workflow and return the prompt_id."""
        async with aiohttp.ClientSession() as session:
            async with session.post(
                f"{self.base_url}/prompt",
                json={"prompt": workflow, "client_id": self.client_id}
            ) as resp:
                data = await resp.json()
                return data["prompt_id"]

    async def get_history(self, prompt_id: str) -> dict:
        """Get the result of a completed prompt."""
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{self.base_url}/history/{prompt_id}"
            ) as resp:
                return await resp.json()

    async def get_image(self, filename: str, subfolder: str = "", type: str = "output") -> bytes:
        """Download a generated image."""
        async with aiohttp.ClientSession() as session:
            params = {"filename": filename, "subfolder": subfolder, "type": type}
            async with session.get(
                f"{self.base_url}/view", params=params
            ) as resp:
                return await resp.read()

    async def wait_for_completion(self, prompt_id: str, timeout: int = 120) -> dict:
        """Poll until the prompt completes."""
        import asyncio
        for _ in range(timeout):
            history = await self.get_history(prompt_id)
            if prompt_id in history:
                return history[prompt_id]
            await asyncio.sleep(1)
        raise TimeoutError(f"Prompt {prompt_id} did not complete in {timeout}s")
```

### 3.2 Workflow Templates

Store as JSON in `backend/workflows/`:

```
backend/workflows/
├── character_generation.json    # Text-to-character
├── character_animate.json       # Still-to-animation
├── character_lipsync.json       # Image+audio-to-video
└── background_remove.json       # Remove background
```

### 3.3 API Endpoints

Add to `backend/main.py`:

```python
from lib.comfyui_client import ComfyUIClient

comfy = ComfyUIClient()

@app.post("/api/avatars/generate-local")
async def generate_avatar_local(request: AvatarGenerateRequest):
    """Generate avatar using local ComfyUI."""
    workflow = load_workflow("character_generation.json")
    workflow = inject_prompt(workflow, request.prompt, request.style)

    prompt_id = await comfy.queue_prompt(workflow)
    result = await comfy.wait_for_completion(prompt_id)

    # Get the output image
    output = result["outputs"]["9"]["images"][0]  # Node 9 = Save Image
    image_data = await comfy.get_image(output["filename"])

    # Save to avatars directory
    avatar_id = str(uuid.uuid4())
    save_path = f"avatars/{avatar_id}.png"
    with open(save_path, "wb") as f:
        f.write(image_data)

    return {"avatar_id": avatar_id, "url": f"/avatars/{avatar_id}.png"}

@app.post("/api/avatars/{avatar_id}/animate-local")
async def animate_avatar_local(avatar_id: str, motion: str = "idle"):
    """Animate avatar using local ComfyUI + AnimateDiff."""
    workflow = load_workflow("character_animate.json")
    workflow = inject_image(workflow, f"avatars/{avatar_id}.png")
    workflow = inject_motion(workflow, motion)

    prompt_id = await comfy.queue_prompt(workflow)
    result = await comfy.wait_for_completion(prompt_id, timeout=300)

    # Get the output video
    output = result["outputs"]["12"]["gifs"][0]  # Node 12 = Video Combine
    video_data = await comfy.get_image(output["filename"], type="output")

    video_path = f"avatars/{avatar_id}_animated.mp4"
    with open(video_path, "wb") as f:
        f.write(video_data)

    return {"video_url": f"/avatars/{avatar_id}_animated.mp4"}
```

---

## Phase 4: Frontend Updates

### 4.1 Studio UI Updates

Add toggle for generation backend:

```html
<div class="backend-toggle">
    <label>
        <input type="radio" name="backend" value="cloud" checked>
        Cloud (Leonardo AI)
    </label>
    <label>
        <input type="radio" name="backend" value="local">
        Local (ComfyUI)
    </label>
</div>
```

### 4.2 Animation Controls

Add motion preset selector:

```html
<div class="animation-controls">
    <h3>Animate Avatar</h3>
    <select id="motion-preset">
        <option value="idle">Idle (breathing, blinking)</option>
        <option value="talking">Talking (head movement)</option>
        <option value="excited">Excited (energetic)</option>
        <option value="thinking">Thinking (contemplative)</option>
    </select>
    <button onclick="animateAvatar()">Generate Animation</button>
</div>
```

---

## Phase 5: Live2D Export (Future)

Once we have animated video output, convert to Live2D:

1. **Frame extraction** - Split video into keyframes
2. **Mesh generation** - Auto-generate deformation mesh
3. **Motion data** - Export as Live2D motion file (.motion3.json)
4. **Model packaging** - Bundle as .moc3 for pixi-live2d-display

Tools to explore:
- Live2D Cubism Editor (manual but professional)
- Open source mesh deformation libraries
- Custom frame-to-motion converter

---

## Hardware Requirements

### Mac Mini (M1/M2/M4)

| Spec | Minimum | Recommended |
|------|---------|-------------|
| RAM | 16 GB | 32 GB |
| Storage | 50 GB free | 100 GB free |
| Chip | M1 | M2 Pro / M4 |

**Expected Performance:**
- Flux generation: ~30-60 sec/image
- AnimateDiff (24 frames): ~2-5 min
- SadTalker lip sync: ~1-2 min

### Model Storage

| Models | Size |
|--------|------|
| Flux.1 Dev | ~12 GB |
| SDXL | ~7 GB |
| AnimateDiff | ~2 GB |
| IP-Adapter | ~1 GB |
| **Total** | **~25 GB** |

---

## Implementation Checklist

### Setup
- [ ] Install ComfyUI Desktop on Mac Mini
- [ ] Download Flux.1 Dev model
- [ ] Download SDXL model (fallback)
- [ ] Install ComfyUI-Manager
- [ ] Install AnimateDiff-Evolved
- [ ] Install IPAdapter-Plus
- [ ] Install LivePortrait or SadTalker
- [ ] Install LayerDiffuse or RMBG
- [ ] Test basic generation workflow

### Backend
- [ ] Create ComfyUIClient class
- [ ] Create workflow JSON templates
- [ ] Add /generate-local endpoint
- [ ] Add /animate-local endpoint
- [ ] Add /lipsync-local endpoint
- [ ] Add health check for ComfyUI connection
- [ ] Add fallback to cloud if local unavailable

### Frontend
- [ ] Add backend toggle (cloud/local)
- [ ] Add animation controls
- [ ] Add progress indicator for local generation
- [ ] Preview animation before applying
- [ ] Download animation as video/GIF

### Testing
- [ ] Test character generation quality
- [ ] Test animation smoothness
- [ ] Test lip sync accuracy
- [ ] Performance benchmarks on Mac Mini
- [ ] Error handling when ComfyUI offline

---

## Resources

- [ComfyUI Documentation](https://docs.comfy.org/)
- [ComfyUI Examples](https://comfyanonymous.github.io/ComfyUI_examples/)
- [AnimateDiff Guide](https://github.com/Kosinkadink/ComfyUI-AnimateDiff-Evolved)
- [IPAdapter Usage](https://github.com/cubiq/ComfyUI_IPAdapter_plus)
- [Workflow Library](https://comfy.org/workflows/)
- [ComfyUI API Reference](https://docs.comfy.org/essentials/comfyui_api)

---

## Notes

- ComfyUI workflows are JSON - easy to version control
- Can export workflows from the UI and tweak programmatically
- Community workflows can be imported directly
- Consider running ComfyUI as a system service for always-on availability
