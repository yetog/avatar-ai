# Open Source Avatar Animation Pipeline

This document covers open source alternatives to manual Live2D rigging.

## Quick Summary

| Tool | Purpose | Install | GPU Required |
|------|---------|---------|--------------|
| **rembg** | Background removal | `pip install rembg` | No |
| **SAM 2/3** | Advanced segmentation | `pip install ultralytics` | Yes |
| **Talking Head Anime 3** | Animate static images | See below | Yes (CUDA) |
| **SadTalker** | Realistic lip sync | See below | Yes (CUDA) |

## Option 1: Talking Head Anime 3 (Recommended for Anime)

Animates anime characters from a single image. No rigging required.

### Features
- Controls: eyes open/close, mouth open/close, head rotation
- Full body support (v3)
- Real-time animation

### Installation

```bash
# Create conda environment
conda create -n tha3 python=3.10
conda activate tha3

# Install PyTorch with CUDA
pip install torch torchvision --index-url https://download.pytorch.org/whl/cu118

# Install the package
pip install simple_talking_anime_avatar

# Or clone the full demo
git clone https://github.com/pkhungurn/talking-head-anime-3-demo.git
cd talking-head-anime-3-demo
pip install -r requirements.txt
```

### Download Models
Models are hosted on the GitHub releases page:
- `separable_float` - Standard quality, smaller file
- `separable_half` - Half precision, even smaller
- `standard_float` - Best quality, largest file

```bash
# Download models to data/models/
wget https://github.com/pkhungurn/talking-head-anime-3-demo/releases/download/v1.0.0/tha3_standard_float.zip
unzip tha3_standard_float.zip -d data/models/
```

### Basic Usage

```python
from simple_talking_anime_avatar import TalkingAnimeAvatar

# Load avatar
avatar = TalkingAnimeAvatar("path/to/character.png")

# Generate animation frame
frame = avatar.render(
    eye_blink=0.5,      # 0=open, 1=closed
    mouth_open=0.3,     # 0=closed, 1=open
    head_x=0.0,         # -1 to 1 (left/right)
    head_y=0.0,         # -1 to 1 (up/down)
)

# Save frame
frame.save("output.png")
```

### Integration with Audio

```python
import numpy as np

def audio_to_mouth(audio_chunk):
    """Convert audio amplitude to mouth position."""
    amplitude = np.abs(audio_chunk).mean()
    # Normalize to 0-1 range
    return min(amplitude / 0.1, 1.0)

# During conversation
for audio_chunk in audio_stream:
    mouth_pos = audio_to_mouth(audio_chunk)
    frame = avatar.render(mouth_open=mouth_pos)
    display(frame)
```

---

## Option 2: SadTalker (Realistic Talking Heads)

Better for semi-realistic or realistic avatars. Creates video from image + audio.

### Installation

```bash
git clone https://github.com/OpenTalker/SadTalker.git
cd SadTalker
pip install -r requirements.txt

# Download models
bash scripts/download_models.sh
```

### Usage

```python
from sadtalker import SadTalker

# Initialize
talker = SadTalker(checkpoint_path="checkpoints/")

# Generate talking video
talker.generate(
    source_image="avatar.png",
    audio="speech.wav",
    output="talking_avatar.mp4"
)
```

---

## Option 3: SAM (Segment Anything) for Layer Separation

For advanced automatic layer separation.

### Installation

```bash
# SAM 3 (latest, best quality)
pip install ultralytics

# Or SAM 2
pip install sam2
```

### Usage with Ultralytics

```python
from ultralytics import SAM

# Load model
model = SAM("sam3_l.pt")  # or sam3_b.pt for smaller

# Segment character
results = model("avatar.png", prompts=["anime character"])

# Get mask
mask = results[0].masks.data[0]
```

### Manual Layer Extraction with SAM

```python
from ultralytics import SAM
from PIL import Image
import numpy as np

def extract_layers_with_sam(image_path):
    model = SAM("sam3_l.pt")
    img = Image.open(image_path).convert("RGBA")

    # Define prompts for each layer
    prompts = {
        "face": "face",
        "eyes": "eyes",
        "mouth": "mouth",
        "hair": "hair",
    }

    layers = {}
    for name, prompt in prompts.items():
        results = model(image_path, prompts=[prompt])
        if results[0].masks:
            mask = results[0].masks.data[0].cpu().numpy()

            # Apply mask to image
            layer = np.array(img)
            layer[:, :, 3] = (mask * 255).astype(np.uint8)
            layers[name] = Image.fromarray(layer)

    return layers
```

---

## Integration with Avatar AI

### Backend Addition

Add to `main.py`:

```python
@app.post("/api/avatars/{avatar_id}/animate")
async def animate_avatar(avatar_id: str, audio_url: Optional[str] = None):
    """Animate avatar using Talking Head Anime 3."""
    try:
        from simple_talking_anime_avatar import TalkingAnimeAvatar

        img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}_nobg.png"
        if not img_path.exists():
            img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}.png"

        avatar = TalkingAnimeAvatar(str(img_path))

        # Return model info - actual animation happens client-side
        return {
            "status": "ready",
            "supports": ["eye_blink", "mouth_open", "head_x", "head_y"],
            "model_loaded": True
        }
    except ImportError:
        raise HTTPException(
            status_code=501,
            detail="Talking Head Anime not installed. Run: pip install simple_talking_anime_avatar"
        )
```

### Real-time Animation (WebSocket)

```python
@app.websocket("/api/ws/animate/{avatar_id}")
async def ws_animate(websocket: WebSocket, avatar_id: str):
    await websocket.accept()

    from simple_talking_anime_avatar import TalkingAnimeAvatar
    import base64
    import io

    img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}_nobg.png"
    avatar = TalkingAnimeAvatar(str(img_path))

    while True:
        data = await websocket.receive_json()

        # Receive animation parameters
        frame = avatar.render(
            eye_blink=data.get("eye_blink", 0),
            mouth_open=data.get("mouth_open", 0),
            head_x=data.get("head_x", 0),
            head_y=data.get("head_y", 0),
        )

        # Send frame as base64
        buffer = io.BytesIO()
        frame.save(buffer, format="PNG")
        frame_b64 = base64.b64encode(buffer.getvalue()).decode()

        await websocket.send_json({"frame": frame_b64})
```

---

## Comparison: Live2D vs Talking Head Anime

| Feature | Live2D | Talking Head Anime 3 |
|---------|--------|---------------------|
| Setup Time | Hours (manual rigging) | Minutes |
| Quality | Professional | Good |
| Customization | Full control | Limited to model |
| File Size | Small (~1MB) | Large (models ~500MB) |
| Runtime | CPU friendly | Needs GPU |
| Real-time | Yes | Yes (with GPU) |

**Recommendation:**
- For production/high-quality: Use Live2D with manual rigging
- For quick prototypes: Use Talking Head Anime 3
- For realistic avatars: Use SadTalker

---

## Resources

- [Talking Head Anime 3 GitHub](https://github.com/pkhungurn/talking-head-anime-3-demo)
- [SadTalker GitHub](https://github.com/OpenTalker/SadTalker)
- [SAM 3 Documentation](https://docs.ultralytics.com/models/sam-3)
- [simple-talking-anime-avatar PyPI](https://pypi.org/project/simple-talking-anime-avatar/)
- [rembg PyPI](https://pypi.org/project/rembg/)
