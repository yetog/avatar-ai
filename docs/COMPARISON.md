# Avatar AI Implementation Comparison

> Analysis Date: 2026-08-16
> Purpose: Determine optimal path forward for AI Companion UX

---

## Executive Summary

We have two parallel implementations:
1. **index.html** - Minimal inline script, working but limited
2. **app.js** - Full-featured module, built but untested with new HTML

**Recommendation:** Adopt app.js approach with fixes for Cubism 2 compatibility.

---

## Side-by-Side Feature Comparison

| Feature | index.html (Current) | app.js (Full) | Winner |
|---------|---------------------|---------------|--------|
| **Avatar Display** | Working | Built, needs test | Tie |
| **Models Available** | 1 (Shizuku hardcoded) | 5 (with selector) | app.js |
| **Model Selector** | None | Dropdown UI | app.js |
| **Voice Conversation** | Working | Built | Tie |
| **Lip Sync** | Basic (Cubism 2 fix) | Web Audio API (Cubism 4 only) | index.html |
| **Chat Panel** | None | Full UI with transcript | app.js |
| **Text Input** | None | Working | app.js |
| **Keyboard Shortcuts** | None | Space/C/Esc | app.js |
| **Loading Overlay** | None | Animated spinner | app.js |
| **Floating Subtitle** | None | When chat hidden | app.js |
| **Mouse Tracking** | Basic | Full | Tie |
| **Code Organization** | Inline (350 lines) | Module (649 lines) | app.js |
| **Build Required** | No | Yes (webpack) | index.html |

---

## Technical Deep Dive

### Lip Sync Implementation

**index.html (Current - Working):**
```javascript
// Cubism 2 compatible - uses setParamFloat with index
function findMouthParam(model) {
    const coreModel = model?.internalModel?.coreModel;
    if (typeof coreModel.getParamIndex === 'function') {
        return coreModel.getParamIndex('PARAM_MOUTH_OPEN_Y');
    }
    return -1;
}

function setMouthOpen(model, value, paramIndex) {
    if (typeof coreModel.setParamFloat === 'function' && paramIndex >= 0) {
        coreModel.setParamFloat(paramIndex, value);  // Cubism 2
    } else if (typeof coreModel.setParameterValueById === 'function') {
        coreModel.setParameterValueById('ParamMouthOpenY', value);  // Cubism 4
    }
}
```

**app.js (Broken for Cubism 2):**
```javascript
// Only works for Cubism 4 models
function setupLipSync(model) {
    model.internalModel.coreModel.setParameterValueById('ParamMouthOpenY', smoothedVolume);
    // ^ This fails for Cubism 2 models like Shizuku
}
```

**Fix Required:** Port Cubism 2 compatibility from index.html to app.js.

---

### Audio Analysis

**index.html (Current):**
```javascript
// Simple random values when speaking
smoothedVolume = 0.4 + Math.random() * 0.6;
```

**app.js (Proper Web Audio API):**
```javascript
// Real frequency analysis
const dataArray = new Uint8Array(analyser.frequencyBinCount);
analyser.getByteFrequencyData(dataArray);

let sum = 0;
for (let i = 0; i < dataArray.length; i++) {
    const val = dataArray[i] / 255;
    sum += val * val;
}
const rms = Math.sqrt(sum / dataArray.length);
const targetVolume = Math.min(rms * 3, 1);

// Smooth the volume
if (targetVolume > smoothedVolume) {
    smoothedVolume = smoothedVolume * 0.3 + targetVolume * 0.7;
} else {
    smoothedVolume = smoothedVolume * 0.7 + targetVolume * 0.3;
}
```

**Note:** app.js has superior audio analysis, but it may not work with ElevenLabs Conversational AI SDK since we don't have direct access to the audio stream. The SDK handles audio internally.

---

### Model Definitions

**index.html:**
```javascript
const modelUrl = 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json';
// Single model, hardcoded
```

**app.js:**
```javascript
const MODELS = {
    shizuku: {
        name: 'Shizuku',
        url: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json',
        scale: 0.28,
        offsetY: 150,
    },
    haru: {
        name: 'Haru',
        url: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json',
        scale: 0.12,
        offsetY: 100,
    },
    hijiki: {
        name: 'Hijiki (Cat)',
        url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-hijiki@1.0.5/assets/hijiki.model.json',
        scale: 0.5,
        offsetY: 200,
    },
    tororo: {
        name: 'Tororo (Cat)',
        url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-tororo@1.0.5/assets/tororo.model.json',
        scale: 0.5,
        offsetY: 200,
    },
    koharu: {
        name: 'Koharu',
        url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-koharu@1.0.5/assets/koharu.model.json',
        scale: 0.28,
        offsetY: 150,
    }
};
```

---

### UI Components

**index.html has:**
- Header with status
- Start/End buttons
- Debug log panel

**app.js adds:**
- Model selector dropdown
- Chat panel with transcript
- Text input with send button
- Keyboard shortcuts (Space, C, Esc)
- Loading overlay with spinner
- Floating subtitle when chat hidden
- Chat toggle button

---

## Build & Bundle Analysis

### Current Bundle Sizes

| File | Size | Contents |
|------|------|----------|
| elevenlabs.js | 555 KB | ElevenLabs SDK only |
| bundle.js | 564 KB | ElevenLabs SDK + app.js |

**Observation:** Nearly identical size because ElevenLabs SDK dominates the bundle.

### Build Commands

```bash
# Current (SDK only)
npm run build  # Builds elevenlabs.js from elevenlabs-only.js

# Full app (proposed)
npx webpack --config webpack.app.config.js --mode production  # Builds bundle.js from app.js
```

---

## Risk Assessment

### Risks of Switching to app.js

| Risk | Severity | Mitigation |
|------|----------|------------|
| Lip sync broken (Cubism 2) | High | Port fix from index.html |
| Audio analysis may not work | Medium | Fall back to mode-based animation |
| Unknown bugs | Medium | Test each model |
| Regression in voice | Low | Same SDK, same signed-url flow |

### Risks of Staying with index.html

| Risk | Severity | Impact |
|------|----------|--------|
| Feature duplication | Medium | Maintenance burden |
| Missing features | High | No model selector, chat, shortcuts |
| Code grows messy | Medium | Inline script hard to maintain |

---

## Recommended Path Forward

### Option A: Hybrid Merge (Recommended)

1. **Start with app.js** as base (has all features)
2. **Port Cubism 2 fix** from index.html
3. **Keep mode-based lip sync** as fallback (ElevenLabs SDK audio not accessible)
4. **Test each model** for compatibility
5. **Deploy as new index.html**

**Effort:** ~2 hours
**Risk:** Low (app.js already built, just needs fixes)

### Option B: Enhance index.html

1. Keep current index.html
2. Add model selector
3. Add chat panel
4. Add keyboard shortcuts

**Effort:** ~3-4 hours
**Risk:** Low but duplicates work already done in app.js

### Option C: Full Rewrite

1. Start fresh with lessons learned
2. Build modular architecture
3. Add all features properly

**Effort:** ~6-8 hours
**Risk:** Medium (scope creep)

---

## Test Plan for Option A

### Phase 1: Basic Functionality
- [ ] Page loads without errors
- [ ] Loading overlay shows then hides
- [ ] Shizuku model displays
- [ ] Status shows "Ready"

### Phase 2: Model Switching
- [ ] Dropdown changes model
- [ ] Each model loads and displays
- [ ] Models positioned correctly
- [ ] Old model removed on switch

### Phase 3: Voice Conversation
- [ ] Start button connects
- [ ] Microphone permission requested
- [ ] Voice heard, AI responds
- [ ] Mode changes reflected in status
- [ ] End button disconnects

### Phase 4: Lip Sync
- [ ] Mouth moves when AI speaks
- [ ] Stops when AI stops
- [ ] Works for Shizuku (Cubism 2)
- [ ] Works for Haru (Cubism 4)

### Phase 5: Chat Features
- [ ] Chat panel displays messages
- [ ] Text input works
- [ ] Send button works
- [ ] Keyboard shortcuts work
- [ ] Chat toggle works

---

## Files to Modify

### If choosing Option A:

1. **src/js/app.js** - Add Cubism 2 lip sync compatibility
2. **webpack.config.js** - Change entry to app.js (or keep separate config)
3. **index.html** - Replace with app-test.html content
4. **docs/RESEARCH.md** - Update with final decision

### Build Process:

```bash
cd /var/www/zaylegend/apps/development/avatar-ai/frontend

# Option 1: Modify main webpack config
# Change entry: './src/js/elevenlabs-only.js' → './src/js/app.js'
# Change output: 'elevenlabs.js' → 'bundle.js'

# Option 2: Keep separate configs
npx webpack --config webpack.app.config.js --mode production
# Then update index.html to load bundle.js instead of elevenlabs.js
```

---

## Appendix: Model Compatibility Matrix

| Model | Cubism Version | Lip Sync Method | Tested |
|-------|----------------|-----------------|--------|
| Shizuku | 2 | setParamFloat | Yes |
| Haru | 4 | setParameterValueById | No |
| Hijiki | 2 | setParamFloat | No |
| Tororo | 2 | setParamFloat | No |
| Koharu | 2 | setParamFloat | No |

**Most models are Cubism 2** - the index.html fix is essential for app.js.

---

## Conclusion

**app.js is the better foundation** but needs the Cubism 2 lip sync fix ported from index.html. The hybrid merge (Option A) is the fastest path to a full-featured AI companion with minimal risk.

Next step: Apply Cubism 2 fix to app.js and test with app-test.html.
