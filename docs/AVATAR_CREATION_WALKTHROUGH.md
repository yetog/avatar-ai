# Avatar Creation Walkthrough

Step-by-step guide to creating a custom Live2D avatar using AI.

---

## Overview

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│  1. GENERATE    │───▶│  2. SEPARATE    │───▶│  3. RIG         │───▶│  4. EXPORT      │
│  AI Art         │    │  Layers         │    │  in Cubism      │    │  .model3.json   │
│  (Leonardo.ai)  │    │  (Photopea)     │    │  (Free Editor)  │    │  + textures     │
└─────────────────┘    └─────────────────┘    └─────────────────┘    └─────────────────┘
```

**Time estimate:** 2-4 hours for first avatar, 1-2 hours once familiar

---

## Step 1: Generate Character Art

### Option A: Leonardo.ai (Recommended - Free)

1. Go to [leonardo.ai](https://leonardo.ai) and create free account
2. Click "Create New Image"
3. Use these settings:
   - **Model:** Anime Pastel Dream or DreamShaper
   - **Size:** 1024x1024 (square)
   - **Guidance Scale:** 7-9

4. Use this prompt template:

```
anime character portrait, front facing, looking at viewer,
symmetrical face, neutral expression, simple solid color background,
[CHARACTER DESCRIPTION],
upper body visible, clean linework, high quality, detailed eyes,
suitable for Live2D rigging, no complex poses
```

**Example for Dr. Zay:**
```
anime character portrait, front facing, looking at viewer,
symmetrical face, neutral expression, simple dark blue background,
young black man, early 30s, confident expression, stylish,
short dark hair, warm brown eyes, wearing headphones around neck,
casual streetwear hoodie, music producer aesthetic,
upper body visible, clean linework, high quality, detailed eyes,
suitable for Live2D rigging
```

5. Generate 4-8 variations, pick the best one
6. Download at highest resolution

### Option B: Bing Image Creator (Free, DALL-E 3)

1. Go to [bing.com/create](https://bing.com/create)
2. Use similar prompts (works well for anime style)

### Tips for Good Results

✅ **DO:**
- Front-facing, symmetrical
- Neutral/slight smile expression
- Simple background (solid color)
- Clear separation between hair/face/body
- High contrast between elements

❌ **DON'T:**
- Side profiles or 3/4 angles
- Complex poses or hands in front of face
- Busy backgrounds
- Hair covering eyes completely
- Low resolution images

---

## Step 2: Separate Layers

### Required Layers for Live2D

```
📁 character.psd
├── 📄 background (solid color, will be removed)
├── 📁 body
│   └── 📄 torso
├── 📁 head
│   ├── 📄 face_base
│   ├── 📄 left_eye_open
│   ├── 📄 right_eye_open
│   ├── 📄 left_eye_closed (for blinking)
│   ├── 📄 right_eye_closed
│   ├── 📄 left_eyebrow
│   ├── 📄 right_eyebrow
│   ├── 📄 nose
│   ├── 📄 mouth_closed
│   ├── 📄 mouth_open_small
│   ├── 📄 mouth_open_wide
│   └── 📄 ears (if visible)
├── 📁 hair
│   ├── 📄 hair_back (behind head)
│   └── 📄 hair_front (bangs, in front)
└── 📁 accessories
    ├── 📄 headphones
    └── 📄 clothing_details
```

### Using Photopea (Free, Web-based)

1. Go to [photopea.com](https://www.photopea.com)
2. Open your generated image
3. **Remove background:**
   - Select > Subject (AI selection)
   - Or use Magic Wand on background
   - Delete background layer

4. **Separate the head from body:**
   - Use Lasso tool to select head area
   - Ctrl+J to copy to new layer
   - Name it "head"

5. **Separate facial features:**
   - Zoom in on face
   - Use Lasso to select left eye
   - Ctrl+J → name "left_eye_open"
   - Repeat for right eye, eyebrows, nose, mouth

6. **Create closed eye versions:**
   - Duplicate eye layers
   - Use Clone Stamp or paint to create closed eyelid
   - Name "left_eye_closed", "right_eye_closed"

7. **Create mouth variations:**
   - mouth_closed (neutral)
   - mouth_open_small (talking)
   - mouth_open_wide (surprised/loud)
   - Use Clone Stamp + painting to modify

8. **Separate hair:**
   - Select front hair (bangs) → new layer "hair_front"
   - Select back hair → new layer "hair_back"

9. **Fill gaps:**
   - Where eyes were, paint skin color on face_base
   - Where mouth was, paint skin
   - This creates the "under layer"

10. **Export as PSD:**
    - File > Export As > PSD
    - Keep layers intact

### Layer Checklist

Before moving to rigging, verify:
- [ ] Background removed
- [ ] Head separate from body
- [ ] Both eyes as separate layers (open + closed versions)
- [ ] Both eyebrows separate
- [ ] Mouth with at least 2-3 states
- [ ] Hair split into front/back
- [ ] Gaps filled where features were cut out
- [ ] All layers named clearly

---

## Step 3: Rig in Live2D Cubism

### Download & Install

1. Go to [live2d.com/en/download/cubism](https://www.live2d.com/en/download/cubism/)
2. Download **Cubism Editor** (Free version works)
3. Install and open

### Import Your PSD

1. File > New > From PSD
2. Select your layered PSD
3. Cubism will import each layer as a "drawable"

### Create Mesh for Each Part

For each drawable (layer):
1. Select the drawable in the parts panel
2. Click "Auto Mesh" in the toolbar
3. Adjust mesh density:
   - Eyes: High density (for deformation)
   - Face: Medium density
   - Hair: Medium-high (for movement)
   - Body: Low density (minimal movement)

### Set Up Deformers

**Rotation Deformer (for head tilt):**
1. Select head parts
2. Create > Rotation Deformer
3. Name it "head_rotation"
4. Parent all head parts to this deformer

**Warp Deformers (for expressions):**
1. Select eye layer
2. Create > Warp Deformer
3. Use for squash/stretch effects

### Set Up Parameters

**Essential parameters to create:**

| Parameter | Controls | Range |
|-----------|----------|-------|
| `ParamAngleX` | Head left/right | -30 to 30 |
| `ParamAngleY` | Head up/down | -30 to 30 |
| `ParamAngleZ` | Head tilt | -30 to 30 |
| `ParamEyeLOpen` | Left eye open/close | 0 to 1 |
| `ParamEyeROpen` | Right eye open/close | 0 to 1 |
| `ParamMouthOpenY` | Mouth open (lip sync) | 0 to 1 |
| `ParamBrowLY` | Left eyebrow up/down | -1 to 1 |
| `ParamBrowRY` | Right eyebrow up/down | -1 to 1 |

**Setting up ParamMouthOpenY (for lip sync):**
1. Create parameter "ParamMouthOpenY" (0 to 1)
2. At value 0: Show mouth_closed, hide others
3. At value 0.5: Show mouth_open_small
4. At value 1: Show mouth_open_wide
5. Use opacity keys to blend between states

**Setting up eye blink:**
1. Create parameter "ParamEyeLOpen" (0 to 1)
2. At value 1: Show left_eye_open (100% opacity)
3. At value 0: Show left_eye_closed (100% opacity)
4. Set up automatic blink in physics

### Test Your Rig

1. Go to Physics/Motion tab
2. Enable "Param Control" panel
3. Drag sliders to test:
   - Does mouth open/close smoothly?
   - Do eyes blink?
   - Does head rotate naturally?

### Video Tutorials

- [Live2D Official Beginner Tutorial](https://www.youtube.com/watch?v=rq_VHxAv0cM)
- [How to Make a VTuber Model](https://www.youtube.com/watch?v=iOC4GBMWH_w)
- [Mouth Sync Setup](https://www.youtube.com/watch?v=92j_kC9PqaE)

---

## Step 4: Export for Web

### Export Settings

1. File > Export For Runtime > Export as moc3
2. Settings:
   - **SDK:** Cubism 4 SDK
   - **Format:** .moc3 (with .model3.json)
   - **Textures:** PNG, 2048x2048 (or 1024 for mobile)

3. You'll get:
   ```
   📁 export/
   ├── character.moc3        # Model binary
   ├── character.model3.json # Config file
   ├── character.physics3.json # Physics (optional)
   └── textures/
       └── texture_00.png    # Character texture
   ```

### Integrate with Avatar AI

1. Create folder for your model:
   ```bash
   mkdir -p /var/www/zaylegend/apps/development/avatar-ai/frontend/models/drzay/
   ```

2. Copy exported files:
   ```bash
   cp -r export/* frontend/models/drzay/
   ```

3. Update app.js MODELS config:
   ```javascript
   const MODELS = {
       // ... existing models ...
       drzay: {
           url: '/avatar-ai/models/drzay/character.model3.json',
           name: 'Dr. Zay',
           scale: 0.3,
           offsetY: 50
       }
   };
   ```

4. Add to model selector in HTML:
   ```html
   <option value="drzay">Dr. Zay (Custom)</option>
   ```

5. Test and adjust scale/offset as needed

---

## Quick Reference

### File Checklist
- [ ] Original AI-generated image (backup)
- [ ] Layered PSD with all parts separated
- [ ] .moc3 model file
- [ ] .model3.json config
- [ ] Texture PNG(s)
- [ ] .physics3.json (if using physics)

### Minimum Viable Avatar
If time is limited, you can skip:
- Eyebrow movement (keep static)
- Multiple mouth states (use 2 instead of 3)
- Hair physics (keep static)
- Body movement (head only)

### Common Issues

| Problem | Solution |
|---------|----------|
| Mouth doesn't sync | Check ParamMouthOpenY is 0-1 range |
| Eyes look weird when closed | Ensure closed eye layer fully covers open |
| Parts disappear | Check draw order in Cubism |
| Model too big/small | Adjust scale in MODELS config |
| Jittery movement | Reduce physics settings |

---

## Resources

- [Live2D Cubism Manual](https://docs.live2d.com/cubism-editor-manual/top/)
- [Free Sample Models](https://www.live2d.com/en/download/sample-data/)
- [r/Live2D Subreddit](https://reddit.com/r/Live2D)
- [Live2D Discord](https://discord.gg/live2d)
