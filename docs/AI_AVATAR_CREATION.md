# AI-Generated Live2D Avatars

Guide for creating custom animated avatars using AI tools.

---

## Quick Comparison

| Method | Cost | Difficulty | Quality | Animation |
|--------|------|------------|---------|-----------|
| **AI Art + Manual Rigging** | Free | Medium | High | Full Live2D |
| **Talking Head Anime** | Free | Easy | Medium | Face only |
| **SadTalker** | Free | Easy | Medium | Face only |
| **VRoid Studio** | Free | Easy | High | 3D (VRM) |
| **D-ID** | Paid | Easy | High | AI-driven |
| **HeyGen** | Paid | Easy | High | AI-driven |

---

## Method 1: AI Art + Live2D Rigging (Recommended)

Best for creating unique, high-quality animated characters.

### Step 1: Generate Character Art

**Tools (Free):**
- [Leonardo.ai](https://leonardo.ai) - Free tier, anime style
- [Bing Image Creator](https://bing.com/create) - Free, DALL-E 3
- [Playground AI](https://playgroundai.com) - Free tier
- [Stable Diffusion](https://github.com/AUTOMATIC1111/stable-diffusion-webui) - Local, free

**Prompt Template:**
```
anime character portrait, front facing, symmetrical face,
neutral expression, simple background, high quality,
detailed eyes, clean linework, [character description],
suitable for Live2D rigging
```

**Tips:**
- Generate front-facing portraits only
- Avoid complex poses or angles
- Keep hair/clothing simple initially
- Generate multiple variations to pick the best

### Step 2: Separate Layers

The PSD needs separate layers for rigging:
```
- Body/Torso (base)
- Head (separate from body)
- Face elements:
  - Left eye (open)
  - Right eye (open)
  - Left eye (closed) - for blinking
  - Right eye (closed)
  - Left eyebrow
  - Right eyebrow
  - Mouth (neutral)
  - Mouth (open variations)
  - Nose
- Hair (front)
- Hair (back)
- Accessories
```

**Tools for Layer Separation:**
- **GIMP** (Free) - Manual, but full control
- **Photopea** (Free, web) - Photoshop clone
- **Remove.bg** - Quick background removal
- **Segment Anything Model (SAM)** - AI segmentation

**AI-Assisted Layer Separation:**
1. Use SAM or similar to auto-segment parts
2. Export each segment as separate layer
3. Paint in missing areas (eyes behind hair, etc.)

### Step 3: Rig in Live2D Cubism

**Download:** [Live2D Cubism Editor](https://www.live2d.com/en/download/cubism/) (Free version available)

**Basic Rigging Steps:**
1. Import PSD with separated layers
2. Create mesh for each part
3. Add deformers:
   - Rotation deformer for head tilt
   - Warp deformers for expressions
4. Set up parameters:
   - `ParamAngleX` / `ParamAngleY` / `ParamAngleZ` - Head rotation
   - `ParamEyeLOpen` / `ParamEyeROpen` - Blinking
   - `ParamMouthOpenY` - Lip sync
   - `ParamBrowLY` / `ParamBrowRY` - Eyebrows
5. Export as `.model3.json`

**Tutorials:**
- [Official Live2D Tutorial](https://docs.live2d.com/cubism-editor-tutorials/top/)
- [YouTube: Live2D for Beginners](https://www.youtube.com/results?search_query=live2d+tutorial+beginner)

---

## Method 2: Talking Head Anime (Easiest)

Single-image animation using AI. No rigging required.

**Repository:** [Talking Head Anime 3](https://github.com/pkhungurn/talking-head-anime-3-demo)

**How it works:**
1. Provide a front-facing anime image
2. AI generates animation from facial landmarks
3. Can be driven by webcam or audio

**Run locally:**
```bash
git clone https://github.com/pkhungurn/talking-head-anime-3-demo
cd talking-head-anime-3-demo
pip install -r requirements.txt
python app.py
```

**Limitations:**
- Face/head only (no body animation)
- Requires GPU for real-time
- Less customizable than Live2D

---

## Method 3: VRoid Studio (3D)

Free tool for creating 3D anime avatars.

**Download:** [VRoid Studio](https://vroid.com/en/studio)

**Workflow:**
1. Design character in VRoid Studio
2. Export as VRM file
3. Use three.js + three-vrm for web rendering
4. Animate with audio-reactive lip sync

**Integration Code:**
```javascript
import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader';
import { VRM, VRMUtils } from '@pixiv/three-vrm';

const loader = new GLTFLoader();
loader.load('avatar.vrm', (gltf) => {
    VRM.from(gltf).then((vrm) => {
        scene.add(vrm.scene);
        // Animate lip sync via vrm.blendShapeProxy
    });
});
```

---

## Method 4: SadTalker (Audio-Driven)

Generate talking head videos from a single image + audio.

**Repository:** [SadTalker](https://github.com/OpenTalker/SadTalker)

**Use Case:** Pre-rendered video responses (not real-time)

**Run:**
```bash
git clone https://github.com/OpenTalker/SadTalker
cd SadTalker
pip install -r requirements.txt
python inference.py --source_image avatar.png --driven_audio speech.wav
```

---

## Method 5: Simple CSS Animation (Lightweight)

For MVP or low-resource environments.

**Approach:**
1. Generate character with AI
2. Create 3-4 mouth states (closed, slightly open, open, wide)
3. Swap images based on audio volume

```javascript
const mouthStates = ['closed', 'small', 'medium', 'wide'];
const thresholds = [0.1, 0.3, 0.6, 0.8];

function updateMouth(volume) {
    let state = 0;
    for (let i = thresholds.length - 1; i >= 0; i--) {
        if (volume > thresholds[i]) { state = i + 1; break; }
    }
    avatarImg.src = `mouth-${mouthStates[state]}.png`;
}
```

---

## Free Model Resources

**Official Live2D Samples:**
- [Cubism SDK Samples](https://github.com/Live2D/CubismWebSamples)
- Includes: Haru, Hiyori, Mark, Natori, Rice

**Community Models:**
- [nizima (Official Marketplace)](https://nizima.com/) - Some free
- [Booth.pm](https://booth.pm/en/search/Live2D) - Fan-made models
- [GitHub Live2D Models](https://github.com/search?q=live2d+model)

**VRM Models:**
- [VRoid Hub](https://hub.vroid.com/) - Thousands of free models
- [Ready Player Me](https://readyplayer.me/) - Free API

---

## Recommended Pipeline for Avatar AI

### MVP (Quick Start)
1. Use existing free Live2D models (Shizuku, Haru)
2. Match character to personality visually

### Custom Characters
1. Generate with Leonardo.ai or Stable Diffusion
2. Use GIMP/Photopea for layer separation
3. Rig in Live2D Cubism Free
4. Export and integrate

### Future Enhancement
1. Per-character avatar matching
2. Multiple expression sets
3. Custom outfits/accessories
4. Idle animations

---

## Integration with Avatar AI

Current models are loaded from CDN:
```javascript
const MODELS = {
    shizuku: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json',
    // Add custom models here
    custom: '/models/custom/custom.model3.json'
};
```

**To add a custom model:**
1. Place files in `frontend/models/custom/`
2. Add entry to MODELS object
3. Add option to model selector

---

## Tools Summary

| Task | Recommended Tool |
|------|------------------|
| Generate Art | Leonardo.ai, Stable Diffusion |
| Remove Background | Remove.bg, GIMP |
| Separate Layers | Photopea, GIMP + SAM |
| Rig Avatar | Live2D Cubism Editor |
| Quick Animation | Talking Head Anime 3 |
| 3D Avatars | VRoid Studio |
| Video Generation | SadTalker |
