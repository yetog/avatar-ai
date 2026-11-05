# Avatar AI Refactoring Plan

**Date:** 2026-10-06
**Goal:** Make Avatar AI demo-ready for IONOS board presentation

---

## Current State Analysis

### Two UI Versions Exist:

| File | Features | State |
|------|----------|-------|
| `index.html` | Basic UI, debug logs visible, character selector only | Currently deployed |
| `app-test.html` | Polished UI, avatar + character selectors, chat export, animated background | Better for demo |

### User Feedback from Test Conversation:
1. **UI not demo-ready** - debug logs visible, basic styling
2. **Lost avatar selection** - can't change visual appearance
3. **Agent doesn't end conversations** - keeps responding with "Is there anything else?"
4. **Agent over-explains** - verbose responses (minor issue)

---

## Refactoring Tasks

### Phase 1: UI Polish (Immediate - Demo Readiness)

#### 1.1 Use app-test.html as Primary Interface
The `app-test.html` file is production-ready with:
- Dual selectors (Avatar visual + Character personality)
- Animated gradient background with floating particles
- Chat panel with export/clear functionality
- Responsive design (desktop sidebar, mobile stacked)
- Professional glassmorphism styling

**Action:** Deploy app-test.html as the main index.html OR update the nginx/deployment to serve app-test.html

#### 1.2 Add IONOS Character to app-test.html
Currently missing from character selector dropdown.

**Changes needed in `app-test.html` line 647-654:**
```html
<select id="characterSelect">
    <option value="ionos">IONOS Customer Service</option>  <!-- ADD -->
    <option value="zay">Zay 2.0</option>
    <option value="dante">Dante</option>
    <option value="sasha">Sasha</option>
    <option value="cora">Cora</option>
    <option value="natasha">Natasha</option>
    <option value="drzay">Dr. Zay</option>
</select>
```

Also update the character names object (line 843-850):
```javascript
const names = {
    ionos: 'IONOS Support',  // ADD
    zay: 'Zay 2.0',
    dante: 'Dante',
    // ...
};
```

#### 1.3 Connect to Voice-Assistant Backend
Verify `bundle.js` or inline script fetches signed URL from:
```
/voice-assistant/api/signed-url?character=${selectedCharacter}
```

### Phase 2: Avatar Model Selection

#### 2.1 Verify Model Switching Works
app-test.html already has model selector (line 637-643):
```html
<select id="modelSelect">
    <option value="shizuku">Shizuku</option>
    <option value="haru">Haru</option>
    <option value="hijiki">Hijiki</option>
    <option value="tororo">Tororo</option>
    <option value="koharu">Koharu</option>
</select>
```

**Required:** Ensure bundle.js has the model URL mapping:
```javascript
const MODEL_URLS = {
    shizuku: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/shizuku/shizuku.model.json',
    haru: 'https://cdn.jsdelivr.net/gh/guansss/pixi-live2d-display/test/assets/haru/haru_greeter_t03.model3.json',
    hijiki: 'https://cdn.jsdelivr.net/gh/Eikanya/Live2d-model/Live2D/Samples/Hijiki/Hijiki.model.json',
    // ... etc
};
```

#### 2.2 Add Model Change Handler
Listen to `modelSelect` changes and reload the Live2D model:
```javascript
document.getElementById('modelSelect').addEventListener('change', async (e) => {
    const modelUrl = MODEL_URLS[e.target.value];
    if (modelUrl && app) {
        // Remove old model
        app.stage.removeChildren();
        // Load new model
        const newModel = await PIXI.live2d.Live2DModel.from(modelUrl);
        // Position and add
        newModel.scale.set(0.25);
        newModel.x = window.innerWidth / 2;
        newModel.anchor.set(0.5, 0.5);
        app.stage.addChild(newModel);
        currentModel = newModel;
    }
});
```

### Phase 3: IONOS Agent Conversation Behavior

#### 3.1 Add Conversation Ending Instructions
Update the IONOS agent prompt to handle natural endings.

**Add to `ionos-cs-agent.sh` IONOS_CS_PROMPT:**
```
CONVERSATION ENDINGS:
When the customer indicates they are done or satisfied:
- "That is everything, thanks" → "You are welcome! Have a great day. Goodbye!"
- "No more questions" → "Perfect! Thanks for choosing IONOS. Take care!"
- "I am good now" → "Glad I could help! Goodbye!"

After saying goodbye, DO NOT ask follow-up questions. The conversation is complete.

If there has been 3+ exchanges without new questions:
- Offer a natural close: "Is there anything else I can help you with today, or shall I let you go?"
```

#### 3.2 Tighten Response Length
Add to prompt:
```
RESPONSE STYLE:
- Keep voice responses under 20 seconds when spoken
- Lead with the answer, then explain if needed
- Use short sentences, avoid filler words
- For yes/no questions, answer directly first

EXAMPLES:
BAD: "That is a great question! So when it comes to SSL certificates, there are actually several different types that IONOS offers. The most common one is our Standard SSL which provides encryption for a single domain..."

GOOD: "Yes, IONOS offers SSL certificates. For one domain, Standard SSL is $3/month. Need it for multiple subdomains? Wildcard SSL covers all of them. Which fits your needs?"
```

#### 3.3 Update the Agent via API
```bash
cd /var/www/zaylegend/apps/development/avatar-ai/scripts
./ionos-cs-agent.sh update agent_0901m490n8kce5pbdsjnpavdtsn3
```

### Phase 4: Integration Testing

#### 4.1 Test Checklist
- [ ] Avatar loads correctly (Shizuku default)
- [ ] Can switch avatars without breaking voice
- [ ] IONOS character appears in dropdown
- [ ] Voice conversation starts/ends cleanly
- [ ] Lip sync works during AI speech
- [ ] Chat panel shows messages correctly
- [ ] Export/clear chat functions work
- [ ] Mobile layout responsive and usable

#### 4.2 Demo Script
1. Start with IONOS character selected
2. Ask: "What hosting options do you have?"
3. Follow up: "How much is shared hosting?"
4. Close: "Perfect, that is all I needed"
5. Show avatar switching capability
6. Export conversation

---

## File Changes Summary

| File | Changes |
|------|---------|
| `app-test.html` | Add IONOS to character dropdown, verify backend connection |
| `bundle.js` | Ensure model switching works, signed URL endpoint correct |
| `ionos-cs-agent.sh` | Update prompt for conversation endings + conciseness |
| ElevenLabs API | Update agent with new prompt |

---

## Quick Win Order

1. **Add IONOS to app-test.html** (5 min)
2. **Update agent prompt** (10 min)
3. **Test model switching** (5 min)
4. **Deploy app-test.html** (5 min)
5. **Full integration test** (15 min)

**Total estimated time:** ~40 minutes to demo-ready state

---

## Future Enhancements (Option A Integration)

After demo success, integrate Sensei AI coaching capabilities:
- Add product knowledge RAG from IONOS AI Model Hub
- Implement sales coaching mode
- Add objection handling database
- Create training scenarios

See: `docs/IONOS_CS_AGENT_CONCEPT.md` for full integration plan.
