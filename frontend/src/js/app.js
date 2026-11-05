// Avatar AI - ElevenLabs Conversational AI with Live2D
import { Conversation } from '@elevenlabs/client';

let conversation = null;
let isConnected = false;
let selectedCharacter = 'zay';

// AI Characters (ElevenLabs Agents)
const CHARACTERS = {
    ionos: { id: 'agent_0901m490n8kce5pbdsjnpavdtsn3', name: 'IONOS Support', description: 'IONOS cloud and hosting support' },
    zay: { id: 'agent_5001k5mwc9fhftabwyc2a69b0e7w', name: 'Zay 2.0', description: 'AI assistant' },
    ashley: { id: 'agent_8401k43w966zehca8xvqcw8q785k', name: 'Ashley', description: 'General assistant' },
    dante: { id: 'agent_5001m0c2h870exfsqeegc6thwmxt', name: 'Dante', description: 'Best friend / Life copilot' },
    sasha: { id: 'agent_0901m0c2hr86e7jbqjq1962qecnz', name: 'Sasha', description: 'Reflection partner' },
    cora: { id: 'agent_7101m0c2jny5fxxtsgzerhat94qg', name: 'Cora', description: 'Engineer / Anime nerd' },
    natasha: { id: 'agent_4201m0c2kcdsfjprx7kc5d6sxj39', name: 'Natasha', description: 'Strategist' },
    drzay: { id: 'agent_6101m0c2gyg1fbtrdkkmt8h3swtp', name: 'Dr. Zay', description: 'A&R / Creative Director' }
};

// Live2D state
let app = null;
let currentModel = null;
let smoothedVolume = 0;

// Audio analysis for lip sync
let audioContext = null;
let analyser = null;
let mediaStreamDestination = null;

// UI state
let isChatVisible = true;
let lastAIMessage = '';

// Hand tracking state
let handsTracker = null;
let videoElement = null;
let canvasElement = null;
let canvasCtx = null;
let handTrackingActive = false;
let lastHandPosition = null;
let lastGesture = null;
let gestureTimeout = null;
let useHandTracking = true; // Toggle for hand vs mouse

// Lip sync state
let mouthParamIndex = -1;

// Avatar Types: live2d, orb, image
let currentAvatarType = 'live2d';
let orbGraphics = null;
let orbNoise = null;
let orbTime = 0;
let imageSprite = null;
let imagePulseTime = 0;

// Gesture animation state
let gestureAnimation = {
    active: false,
    type: null,
    startTime: 0,
    duration: 800,
    params: {}
};

const MODELS = {
    tororo: {
        name: 'Tororo',
        url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-tororo@1.0.5/assets/tororo.model.json',
        scale: 0.5,
        offsetY: 200,
    },
    hijiki: {
        name: 'Hijiki',
        url: 'https://cdn.jsdelivr.net/npm/live2d-widget-model-hijiki@1.0.5/assets/hijiki.model.json',
        scale: 0.5,
        offsetY: 200,
    }
};

// Orb avatar configurations
const ORB_CONFIGS = {
    ionos: { name: 'IONOS Orb', color: 0x003D8F, glowColor: 0x0066CC, size: 150 },
    energy: { name: 'Energy Orb', color: 0x00ff9d, glowColor: 0x00ffcc, size: 150 },
    fire: { name: 'Fire Orb', color: 0xff6600, glowColor: 0xff9933, size: 150 },
    cosmic: { name: 'Cosmic Orb', color: 0x9933ff, glowColor: 0xcc66ff, size: 150 },
};

// Image avatar configurations
const IMAGE_CONFIGS = {
    assistant: { name: 'AI Assistant', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=assistant', size: 200 },
    robot: { name: 'Robot', url: 'https://api.dicebear.com/7.x/bottts/svg?seed=robot', size: 200 },
    custom: { name: 'Custom', url: '', size: 200 },
};

// Simple noise function for orb movement (replaces SimplexNoise dependency)
function createNoise() {
    const permutation = [];
    for (let i = 0; i < 256; i++) permutation[i] = i;
    for (let i = 255; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [permutation[i], permutation[j]] = [permutation[j], permutation[i]];
    }
    const p = [...permutation, ...permutation];

    function fade(t) { return t * t * t * (t * (t * 6 - 15) + 10); }
    function lerp(a, b, t) { return a + t * (b - a); }
    function grad(hash, x, y) {
        const h = hash & 3;
        const u = h < 2 ? x : y;
        const v = h < 2 ? y : x;
        return ((h & 1) ? -u : u) + ((h & 2) ? -v : v);
    }

    return function noise2D(x, y) {
        const X = Math.floor(x) & 255;
        const Y = Math.floor(y) & 255;
        x -= Math.floor(x);
        y -= Math.floor(y);
        const u = fade(x);
        const v = fade(y);
        const A = p[X] + Y, B = p[X + 1] + Y;
        return lerp(
            lerp(grad(p[A], x, y), grad(p[B], x - 1, y), u),
            lerp(grad(p[A + 1], x, y - 1), grad(p[B + 1], x - 1, y - 1), u),
            v
        );
    };
}

// Initialize app when ready
function waitForPixi(callback) {
    if (typeof PIXI !== 'undefined' && PIXI.live2d) {
        callback();
    } else {
        console.log('⏳ Waiting for PIXI...');
        setTimeout(() => waitForPixi(callback), 100);
    }
}

function init() {
    waitForPixi(() => {
        console.log('✅ PIXI available:', typeof PIXI, typeof PIXI.live2d);
        initializeApp();
    });
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}

async function initializeApp() {
    console.log('🎭 Avatar AI initializing...');

    updateLoadingText('Initializing graphics...');

    // Initialize Live2D (PIXI is loaded via CDN in HTML)
    initPixi();

    updateLoadingText('Loading avatar model...');
    await loadModel('tororo');

    initMouseTracking();
    startUpdateLoop();

    // Set up UI handlers
    setupUIHandlers();
    setupKeyboardShortcuts();
    setupChatToggle();
    setupTextInput();

    // Hide loading overlay
    hideLoadingOverlay();

    // Try to initialize hand tracking (non-blocking)
    if (typeof Hands !== 'undefined') {
        setTimeout(() => {
            initHandTracking().catch(e => console.log('Hand tracking not available:', e));
        }, 1000);
    }

    // Update status
    updateStatus('disconnected', 'Click Start to begin');
}

function updateLoadingText(text) {
    const loadingText = document.getElementById('loadingText');
    if (loadingText) loadingText.textContent = text;
}

function hideLoadingOverlay() {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.classList.add('hidden');
        setTimeout(() => {
            overlay.style.display = 'none';
        }, 500);
    }
}

function showLoadingOverlay(text) {
    const overlay = document.getElementById('loadingOverlay');
    if (overlay) {
        overlay.style.display = 'flex';
        overlay.classList.remove('hidden');
        updateLoadingText(text || 'Loading...');
    }
}

function setupUIHandlers() {
    const startBtn = document.getElementById('startBtn');
    const endBtn = document.getElementById('endBtn');
    const avatarTypeSelect = document.getElementById('avatarTypeSelect');
    const modelSelect = document.getElementById('modelSelect');
    const characterSelect = document.getElementById('characterSelect');

    if (startBtn) {
        startBtn.addEventListener('click', startConversation);
    }
    if (endBtn) {
        endBtn.addEventListener('click', endConversation);
    }

    // Avatar type selector
    if (avatarTypeSelect) {
        avatarTypeSelect.addEventListener('change', (e) => {
            const type = e.target.value;
            updateAvatarOptions(type);
            // Load first option of new type
            const firstOption = modelSelect.options[0]?.value;
            if (firstOption) {
                switchAvatarType(type, firstOption);
            }
        });
    }

    if (modelSelect) {
        modelSelect.addEventListener('change', (e) => {
            const type = avatarTypeSelect?.value || 'live2d';
            switchAvatarType(type, e.target.value);
        });
    }
    if (characterSelect) {
        characterSelect.addEventListener('change', (e) => {
            selectedCharacter = e.target.value;
            const char = CHARACTERS[selectedCharacter];
            console.log(`Character changed to: ${char?.name || selectedCharacter}`);
            // If connected, need to reconnect with new character
            if (isConnected) {
                addToTranscript({ message: `Switching to ${char?.name}... Please wait.`, source: 'system' });
                endConversation().then(() => {
                    setTimeout(startConversation, 500);
                });
            }
        });
    }
}

// Update avatar dropdown options based on type
function updateAvatarOptions(type) {
    const modelSelect = document.getElementById('modelSelect');
    if (!modelSelect) return;

    // Clear existing options
    modelSelect.innerHTML = '';

    let options = [];
    switch (type) {
        case 'live2d':
            options = Object.entries(MODELS).map(([key, val]) => ({ value: key, label: val.name }));
            break;
        case 'orb':
            options = Object.entries(ORB_CONFIGS).map(([key, val]) => ({ value: key, label: val.name }));
            break;
        case 'image':
            options = Object.entries(IMAGE_CONFIGS).map(([key, val]) => ({ value: key, label: val.name }));
            break;
    }

    options.forEach(opt => {
        const option = document.createElement('option');
        option.value = opt.value;
        option.textContent = opt.label;
        modelSelect.appendChild(option);
    });
}

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ignore if typing in input
        if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

        switch (e.code) {
            case 'Space':
                e.preventDefault();
                if (isConnected) {
                    endConversation();
                } else {
                    startConversation();
                }
                break;
            case 'Escape':
                if (isConnected) {
                    endConversation();
                }
                break;
            case 'KeyC':
                toggleChat();
                break;
            case 'KeyH':
                toggleHandTracking();
                updateHandToggleButton();
                break;
        }
    });

    // Hand tracking toggle button
    const handToggle = document.getElementById('handToggle');
    if (handToggle) {
        handToggle.addEventListener('click', () => {
            toggleHandTracking();
            updateHandToggleButton();
        });
    }
}

function updateHandToggleButton() {
    const btn = document.getElementById('handToggle');
    if (btn) {
        btn.classList.toggle('active', handTrackingActive);
        btn.title = handTrackingActive ? 'Disable Hand Tracking' : 'Enable Hand Tracking';
    }
}

function setupChatToggle() {
    const chatToggle = document.getElementById('chatToggle');
    if (chatToggle) {
        chatToggle.addEventListener('click', toggleChat);
    }
}

function toggleChat() {
    const chatPanel = document.getElementById('chatPanel');
    const chatToggle = document.getElementById('chatToggle');

    isChatVisible = !isChatVisible;

    if (chatPanel) {
        chatPanel.classList.toggle('hidden', !isChatVisible);
    }
    if (chatToggle) {
        chatToggle.classList.toggle('active', !isChatVisible);
        chatToggle.textContent = isChatVisible ? '💬' : '✕';
    }

    // Show floating subtitle when chat is hidden
    updateFloatingSubtitle();
}

function updateFloatingSubtitle() {
    const subtitle = document.getElementById('floatingSubtitle');
    if (!subtitle) return;

    if (!isChatVisible && lastAIMessage) {
        subtitle.textContent = lastAIMessage;
        subtitle.classList.add('visible');
    } else {
        subtitle.classList.remove('visible');
    }
}

function setupTextInput() {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');

    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendTextMessage();
            }
        });
    }

    if (sendBtn) {
        sendBtn.addEventListener('click', sendTextMessage);
    }
}

async function sendTextMessage() {
    const chatInput = document.getElementById('chatInput');
    if (!chatInput) return;

    const message = chatInput.value.trim();
    if (!message || !isConnected || !conversation) return;

    // Clear input
    chatInput.value = '';

    // Add to transcript
    addToTranscript({ type: 'user', message: message });

    // Send via ElevenLabs conversation
    // The ElevenLabs SDK sends audio, but we can use the underlying session
    // For text fallback, we'll call the instant-chat API
    try {
        const response = await fetch('/voice-assistant/api/instant-chat', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ text: message, fastMode: false })
        });
        const data = await response.json();

        // Add AI response to transcript
        if (data.response) {
            addToTranscript({ type: 'assistant', message: data.response });
        }

        // Play audio if available
        if (data.audioUrl) {
            const audioPath = data.audioUrl.replace('/api/', '/');
            await playAIAudioFromUrl(`/voice-assistant/api${audioPath}`);
        }
    } catch (err) {
        console.error('Text message failed:', err);
        addToTranscript({ type: 'assistant', message: 'Sorry, I had trouble processing that.' });
    }
}

// ========== PIXI & Live2D Setup ==========
function initPixi() {
    const canvas = document.getElementById('canvas');
    const container = canvas.parentElement; // avatar-section

    app = new PIXI.Application({
        view: canvas,
        resizeTo: container, // Resize to avatar section, not window
        backgroundAlpha: 0,
        antialias: true,
        resolution: window.devicePixelRatio || 1,
        autoDensity: true
    });

    // Handle resize
    window.addEventListener('resize', () => {
        if (currentModel) {
            positionModel(currentModel);
        }
    });
}

async function loadModel(modelKey) {
    const config = MODELS[modelKey];
    if (!config) {
        console.error('Model config not found:', modelKey);
        return;
    }

    console.log('🎭 Loading model:', config.name, config.url);
    updateStatus('loading', 'Loading avatar...');
    showLoadingOverlay('Loading ' + config.name + '...');

    // Remove old model
    if (currentModel) {
        app.stage.removeChild(currentModel);
        currentModel.destroy();
        currentModel = null;
    }

    try {
        // Use PIXI.live2d global from CDN
        const Live2DModel = PIXI.live2d.Live2DModel;
        console.log('Live2DModel:', Live2DModel);

        const model = await Live2DModel.from(config.url);
        console.log('✅ Model loaded:', model);

        currentModel = model;

        // Position and scale
        model.scale.set(config.scale);
        positionModel(model);

        // Add to stage
        app.stage.addChild(model);
        console.log('✅ Model added to stage');

        // Set up lip sync
        setupLipSync(model);

        hideLoadingOverlay();
        updateStatus('disconnected', 'Ready - click Start');

    } catch (err) {
        console.error('❌ Failed to load model:', err);
        hideLoadingOverlay();
        updateStatus('error', 'Model load failed: ' + err.message);
    }
}

function positionModel(model) {
    const config = MODELS[Object.keys(MODELS).find(k => MODELS[k].url === model.modelSettings?.url)] || MODELS.tororo;

    // Use avatar-section container dimensions for centering
    const container = document.getElementById('canvas')?.parentElement;
    const width = container?.offsetWidth || window.innerWidth;
    const height = container?.offsetHeight || window.innerHeight;

    model.x = width / 2;
    model.y = height / 2 + (config.offsetY || 0);
    model.anchor.set(0.5, 0.5);
}

// Find mouth parameter index for Cubism 2 models
function findMouthParam(model) {
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel) return -1;

    // Cubism 2 uses getParamIndex
    if (typeof coreModel.getParamIndex === 'function') {
        const idx = coreModel.getParamIndex('PARAM_MOUTH_OPEN_Y');
        if (idx >= 0) return idx;
        // Try alternate name
        return coreModel.getParamIndex('ParamMouthOpenY');
    }
    return -1;
}

// Set mouth open value - handles both Cubism 2 and 4
function setMouthOpen(model, value) {
    const coreModel = model?.internalModel?.coreModel;
    if (!coreModel) return;

    // Cubism 2: use setParamFloat with index
    if (typeof coreModel.setParamFloat === 'function' && mouthParamIndex >= 0) {
        coreModel.setParamFloat(mouthParamIndex, value);
        return;
    }

    // Cubism 4: use setParameterValueById
    if (typeof coreModel.setParameterValueById === 'function') {
        coreModel.setParameterValueById('ParamMouthOpenY', value);
    }
}

function setupLipSync(model) {
    // Find mouth parameter for this model (Cubism 2 vs 4)
    mouthParamIndex = findMouthParam(model);
    console.log('🎤 Mouth param index:', mouthParamIndex);

    // The lip sync reads from smoothedVolume via the ticker loop
    // No need to patch motionManager - we update in startUpdateLoop
}

// ========== Orb Avatar ==========
function createOrbAvatar(orbKey) {
    const config = ORB_CONFIGS[orbKey] || ORB_CONFIGS.energy;
    console.log('🔮 Creating orb avatar:', config.name);

    try {
        // Clear any existing avatar
        clearCurrentAvatar();

        // Check if PIXI app exists
        if (!app || !app.stage) {
            console.error('PIXI app not initialized');
            hideLoadingOverlay();
            updateStatus('error', 'Graphics not ready');
            return;
        }

        // Initialize noise for organic movement
        orbNoise = createNoise();
        orbTime = 0;

        // Create container for orb
        const container = new PIXI.Container();

        // Create glow layer (larger, more transparent) - no filter for compatibility
        const glowGraphics = new PIXI.Graphics();
        glowGraphics.beginFill(config.glowColor, 0.15);
        glowGraphics.drawCircle(0, 0, config.size * 1.8);
        glowGraphics.endFill();
        glowGraphics.beginFill(config.glowColor, 0.2);
        glowGraphics.drawCircle(0, 0, config.size * 1.5);
        glowGraphics.endFill();
        glowGraphics.beginFill(config.glowColor, 0.25);
        glowGraphics.drawCircle(0, 0, config.size * 1.2);
        glowGraphics.endFill();

        // Try to add blur filter if available
        try {
            if (PIXI.filters && PIXI.filters.BlurFilter) {
                const blurFilter = new PIXI.filters.BlurFilter(15, 4);
                glowGraphics.filters = [blurFilter];
            } else if (PIXI.BlurFilter) {
                const blurFilter = new PIXI.BlurFilter(15, 4);
                glowGraphics.filters = [blurFilter];
            }
        } catch (e) {
            console.log('Blur filter not available, using layered glow');
        }

        container.addChild(glowGraphics);

        // Create main orb
        orbGraphics = new PIXI.Graphics();
        orbGraphics.beginFill(config.color, 0.9);
        orbGraphics.drawCircle(0, 0, config.size);
        orbGraphics.endFill();

        // Add inner highlight
        const highlight = new PIXI.Graphics();
        highlight.beginFill(0xffffff, 0.25);
        highlight.drawEllipse(-config.size * 0.3, -config.size * 0.3, config.size * 0.35, config.size * 0.25);
        highlight.endFill();
        orbGraphics.addChild(highlight);

        container.addChild(orbGraphics);

        // Store reference for animation
        container.orbConfig = config;
        container.glowGraphics = glowGraphics;
        container.baseSize = config.size;

        // Position in center
        const canvasContainer = document.getElementById('canvas')?.parentElement;
        const width = canvasContainer?.offsetWidth || window.innerWidth;
        const height = canvasContainer?.offsetHeight || window.innerHeight;
        container.x = width / 2;
        container.y = height / 2;

        app.stage.addChild(container);
        currentModel = container;
        currentAvatarType = 'orb';

        console.log('✅ Orb avatar created successfully');
        hideLoadingOverlay();
        updateStatus('disconnected', 'Ready - click Start');

    } catch (err) {
        console.error('Failed to create orb avatar:', err);
        hideLoadingOverlay();
        updateStatus('error', 'Failed to create orb: ' + err.message);
    }
}

function updateOrbAvatar() {
    if (currentAvatarType !== 'orb' || !currentModel || !orbNoise) return;

    orbTime += 0.008;

    const container = currentModel;
    const baseSize = container.baseSize || 150;

    // Organic movement using noise
    const moveX = orbNoise(orbTime * 0.5, 0) * 30;
    const moveY = orbNoise(0, orbTime * 0.5) * 20;

    // Base position
    const canvasContainer = document.getElementById('canvas')?.parentElement;
    const width = canvasContainer?.offsetWidth || window.innerWidth;
    const height = canvasContainer?.offsetHeight || window.innerHeight;

    container.x = width / 2 + moveX;
    container.y = height / 2 + moveY;

    // Scale based on audio (lip sync equivalent)
    const audioScale = 1 + smoothedVolume * 0.3;
    const noiseScale = 1 + orbNoise(orbTime * 2, orbTime * 2) * 0.05;
    const totalScale = audioScale * noiseScale;

    if (orbGraphics) {
        orbGraphics.scale.set(totalScale);
    }

    // Glow intensity based on audio
    if (container.glowGraphics) {
        const glowScale = 1 + smoothedVolume * 0.5;
        container.glowGraphics.scale.set(glowScale);
        container.glowGraphics.alpha = 0.3 + smoothedVolume * 0.4;
    }
}

// ========== Image Avatar ==========
async function createImageAvatar(imageKey, customUrl = null) {
    const config = IMAGE_CONFIGS[imageKey] || IMAGE_CONFIGS.assistant;
    const url = customUrl || config.url;

    if (!url) {
        console.error('No image URL provided');
        hideLoadingOverlay();
        updateStatus('error', 'No image URL');
        return;
    }

    console.log('🖼️ Creating image avatar:', config.name, url);

    // Clear any existing avatar
    clearCurrentAvatar();

    // Check if PIXI app exists
    if (!app || !app.stage) {
        console.error('PIXI app not initialized');
        hideLoadingOverlay();
        updateStatus('error', 'Graphics not ready');
        return;
    }

    try {
        // Load texture - PIXI v6 compatible
        let texture;
        if (PIXI.Assets && PIXI.Assets.load) {
            // PIXI v7+
            texture = await PIXI.Assets.load(url);
        } else if (PIXI.Texture && PIXI.Texture.from) {
            // PIXI v6
            texture = PIXI.Texture.from(url);
            // Wait for texture to load
            if (!texture.valid) {
                await new Promise((resolve, reject) => {
                    texture.baseTexture.on('loaded', resolve);
                    texture.baseTexture.on('error', reject);
                    // Timeout after 10 seconds
                    setTimeout(() => reject(new Error('Texture load timeout')), 10000);
                });
            }
        } else {
            throw new Error('No texture loader available');
        }

        // Create sprite
        imageSprite = new PIXI.Sprite(texture);
        imageSprite.anchor.set(0.5);

        // Scale to fit size
        const texWidth = texture.width || 200;
        const texHeight = texture.height || 200;
        const scale = config.size / Math.max(texWidth, texHeight);
        imageSprite.scale.set(scale);

        // Create container with glow effect
        const container = new PIXI.Container();

        // Create layered glow behind image (no filter needed)
        const glowGraphics = new PIXI.Graphics();
        glowGraphics.beginFill(0x00ff9d, 0.1);
        glowGraphics.drawCircle(0, 0, config.size * 0.9);
        glowGraphics.endFill();
        glowGraphics.beginFill(0x00ff9d, 0.15);
        glowGraphics.drawCircle(0, 0, config.size * 0.7);
        glowGraphics.endFill();
        glowGraphics.beginFill(0x00ff9d, 0.2);
        glowGraphics.drawCircle(0, 0, config.size * 0.5);
        glowGraphics.endFill();

        // Try to add blur filter if available
        try {
            if (PIXI.filters && PIXI.filters.BlurFilter) {
                glowGraphics.filters = [new PIXI.filters.BlurFilter(10, 3)];
            } else if (PIXI.BlurFilter) {
                glowGraphics.filters = [new PIXI.BlurFilter(10, 3)];
            }
        } catch (e) {
            console.log('Blur filter not available for image glow');
        }

        container.addChild(glowGraphics);
        container.addChild(imageSprite);

        // Store references
        container.imageSprite = imageSprite;
        container.glowGraphics = glowGraphics;
        container.baseScale = scale;

        // Position in center
        const canvasContainer = document.getElementById('canvas')?.parentElement;
        const width = canvasContainer?.offsetWidth || window.innerWidth;
        const height = canvasContainer?.offsetHeight || window.innerHeight;
        container.x = width / 2;
        container.y = height / 2;

        app.stage.addChild(container);
        currentModel = container;
        currentAvatarType = 'image';
        imagePulseTime = 0;

        console.log('✅ Image avatar created successfully');
        hideLoadingOverlay();
        updateStatus('disconnected', 'Ready - click Start');

    } catch (err) {
        console.error('Failed to load image avatar:', err);
        hideLoadingOverlay();
        updateStatus('error', 'Failed to load image: ' + err.message);
    }
}

function updateImageAvatar() {
    if (currentAvatarType !== 'image' || !currentModel) return;

    imagePulseTime += 0.05;

    const container = currentModel;
    const baseScale = container.baseScale || 1;

    // Gentle floating animation
    const floatY = Math.sin(imagePulseTime * 0.5) * 10;

    const canvasContainer = document.getElementById('canvas')?.parentElement;
    const width = canvasContainer?.offsetWidth || window.innerWidth;
    const height = canvasContainer?.offsetHeight || window.innerHeight;

    container.x = width / 2;
    container.y = height / 2 + floatY;

    // Pulse based on audio
    if (container.imageSprite) {
        const audioScale = 1 + smoothedVolume * 0.15;
        const pulseScale = 1 + Math.sin(imagePulseTime) * 0.02;
        container.imageSprite.scale.set(baseScale * audioScale * pulseScale);
    }

    // Glow intensity based on audio
    if (container.glowGraphics) {
        container.glowGraphics.alpha = 0.2 + smoothedVolume * 0.5;
        container.glowGraphics.scale.set(1 + smoothedVolume * 0.3);
    }
}

// ========== Avatar Management ==========
function clearCurrentAvatar() {
    if (currentModel) {
        app.stage.removeChild(currentModel);
        if (currentModel.destroy) currentModel.destroy({ children: true });
        currentModel = null;
    }
    orbGraphics = null;
    imageSprite = null;
}

async function switchAvatarType(type, key, customUrl = null) {
    console.log('🔄 Switching avatar type:', type, key);
    showLoadingOverlay('Loading avatar...');

    currentAvatarType = type;

    switch (type) {
        case 'live2d':
            await loadModel(key);
            break;
        case 'orb':
            createOrbAvatar(key);
            break;
        case 'image':
            await createImageAvatar(key, customUrl);
            break;
        default:
            console.error('Unknown avatar type:', type);
    }
}

function initMouseTracking() {
    // Mouse fallback when hand tracking isn't active
    document.addEventListener('mousemove', e => {
        // Only Live2D models have the focus method
        if (currentModel && currentAvatarType === 'live2d' && !handTrackingActive) {
            currentModel.focus(e.clientX, e.clientY);
        }
    });
}

// ========== Hand Tracking with MediaPipe ==========
async function initHandTracking() {
    // Check if MediaPipe Hands is available
    if (typeof Hands === 'undefined') {
        console.log('⚠️ MediaPipe Hands not loaded, using mouse tracking only');
        return false;
    }

    try {
        // Create video element for camera
        videoElement = document.createElement('video');
        videoElement.id = 'handTrackingVideo';
        videoElement.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 160px;
            height: 120px;
            border-radius: 12px;
            border: 2px solid rgba(255,255,255,0.2);
            z-index: 100;
            transform: scaleX(-1);
            object-fit: cover;
        `;
        document.body.appendChild(videoElement);

        // Create canvas overlay for hand visualization
        canvasElement = document.createElement('canvas');
        canvasElement.id = 'handTrackingCanvas';
        canvasElement.width = 160;
        canvasElement.height = 120;
        canvasElement.style.cssText = `
            position: fixed;
            bottom: 10px;
            right: 10px;
            width: 160px;
            height: 120px;
            border-radius: 12px;
            z-index: 101;
            pointer-events: none;
            transform: scaleX(-1);
        `;
        document.body.appendChild(canvasElement);
        canvasCtx = canvasElement.getContext('2d');

        // Initialize MediaPipe Hands
        handsTracker = new Hands({
            locateFile: (file) => {
                return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1646424915/${file}`;
            }
        });

        handsTracker.setOptions({
            maxNumHands: 1,
            modelComplexity: 0, // Faster, less accurate
            minDetectionConfidence: 0.6,
            minTrackingConfidence: 0.5
        });

        handsTracker.onResults(onHandResults);

        // Get camera stream
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { width: 320, height: 240, facingMode: 'user' }
        });

        videoElement.srcObject = stream;
        await videoElement.play();

        // Start processing frames
        handTrackingActive = true;
        processHandFrame();

        console.log('🖐️ Hand tracking initialized');
        addSystemMessage('Hand tracking enabled - avatar will follow your hand!');

        return true;

    } catch (err) {
        console.error('Hand tracking init failed:', err);
        addSystemMessage('Hand tracking unavailable - using mouse');
        return false;
    }
}

function processHandFrame() {
    if (!handTrackingActive || !handsTracker || !videoElement) return;

    handsTracker.send({ image: videoElement }).then(() => {
        requestAnimationFrame(processHandFrame);
    });
}

function onHandResults(results) {
    // Clear canvas
    if (canvasCtx) {
        canvasCtx.clearRect(0, 0, canvasElement.width, canvasElement.height);
    }

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        const landmarks = results.multiHandLandmarks[0];

        // Draw hand landmarks on mini preview
        drawHandLandmarks(landmarks);

        // Gesture detection only - avatar follows mouse, not hand
        // This prevents the avatar from swaying during gestures
        detectGestures(landmarks);
    }
}

function drawHandLandmarks(landmarks) {
    if (!canvasCtx) return;

    const w = canvasElement.width;
    const h = canvasElement.height;

    // Draw connections
    canvasCtx.strokeStyle = 'rgba(0, 255, 157, 0.6)';
    canvasCtx.lineWidth = 2;

    const connections = [
        [0, 1], [1, 2], [2, 3], [3, 4],           // Thumb
        [0, 5], [5, 6], [6, 7], [7, 8],           // Index
        [0, 9], [9, 10], [10, 11], [11, 12],      // Middle
        [0, 13], [13, 14], [14, 15], [15, 16],    // Ring
        [0, 17], [17, 18], [18, 19], [19, 20],    // Pinky
        [5, 9], [9, 13], [13, 17]                  // Palm
    ];

    connections.forEach(([i, j]) => {
        canvasCtx.beginPath();
        canvasCtx.moveTo(landmarks[i].x * w, landmarks[i].y * h);
        canvasCtx.lineTo(landmarks[j].x * w, landmarks[j].y * h);
        canvasCtx.stroke();
    });

    // Draw points
    canvasCtx.fillStyle = '#00FF9D';
    landmarks.forEach((lm, i) => {
        canvasCtx.beginPath();
        canvasCtx.arc(lm.x * w, lm.y * h, i === 8 ? 5 : 3, 0, 2 * Math.PI);
        canvasCtx.fill();
    });
}

function detectGestures(landmarks) {
    // Key landmarks
    const thumbTip = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const wrist = landmarks[0];
    const indexMcp = landmarks[5];

    // Check if fingers are extended (tip above MCP)
    const indexExtended = indexTip.y < landmarks[6].y;
    const middleExtended = middleTip.y < landmarks[10].y;
    const ringExtended = ringTip.y < landmarks[14].y;
    const pinkyExtended = pinkyTip.y < landmarks[18].y;

    // Thumbs up: thumb extended upward, other fingers curled
    const thumbUp = thumbTip.y < wrist.y - 0.1 &&
                    !indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

    // Thumbs down: thumb extended downward, other fingers curled
    const thumbDown = thumbTip.y > wrist.y + 0.1 &&
                      !indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

    // Wave/Open palm: all fingers extended
    const wave = indexExtended && middleExtended && ringExtended && pinkyExtended;

    // Peace sign: index and middle extended, others curled
    const peace = indexExtended && middleExtended && !ringExtended && !pinkyExtended;

    // Point: only index finger extended
    const point = indexExtended && !middleExtended && !ringExtended && !pinkyExtended;

    // Trigger gesture reactions (with cooldown)
    // Priority: specific gestures before general ones
    let detectedGesture = null;

    if (thumbUp) detectedGesture = 'thumbsup';
    else if (thumbDown) detectedGesture = 'thumbsdown';
    else if (peace) detectedGesture = 'peace';
    else if (point) detectedGesture = 'point';
    else if (wave) detectedGesture = 'wave';

    if (detectedGesture && detectedGesture !== lastGesture) {
        lastGesture = detectedGesture;

        // Clear previous timeout
        if (gestureTimeout) clearTimeout(gestureTimeout);

        // React to gesture
        onGestureDetected(detectedGesture);

        // Reset after cooldown
        gestureTimeout = setTimeout(() => {
            lastGesture = null;
        }, 2000);
    }
}

function onGestureDetected(gesture) {
    console.log(`🖐️ Gesture detected: ${gesture}`);

    // Visual feedback - support-friendly reactions
    const reactions = {
        'wave': { message: '👋 Hello!', expression: 'happy' },
        'thumbsup': { message: '👍 Got it!', expression: 'happy' },
        'thumbsdown': { message: '👎 Not quite...', expression: 'concerned' },
        'peace': { message: '✌️ Take care!', expression: 'happy' },
        'point': { message: '👆 One moment...', expression: 'thinking' }
    };

    const reaction = reactions[gesture];
    if (reaction) {
        // Show floating reaction
        showGestureReaction(reaction.message);

        // Trigger avatar-specific animation
        triggerGestureAnimation(gesture, reaction.expression);
    }
}

// ========== Gesture Animation System ==========
function triggerGestureAnimation(gesture, expression) {
    // Define animation parameters per gesture
    const animationConfigs = {
        'wave': {
            duration: 1000,
            orbColor: 0x00ff9d,      // Green flash
            orbScale: 1.3,           // Expand
            orbWobble: true,
            imageRotation: 15,       // Slight wiggle
            imageBounce: true,
            live2dExpression: 'happy'
        },
        'thumbsup': {
            duration: 800,
            orbColor: 0x00ff00,      // Bright green
            orbScale: 1.4,           // Big grow
            orbPulse: true,
            imageScale: 1.2,         // Pop up
            imageGlow: 0x00ff00,
            live2dExpression: 'happy'
        },
        'thumbsdown': {
            duration: 800,
            orbColor: 0xff3333,      // Red
            orbScale: 0.8,           // Shrink
            orbShake: true,
            imageShake: true,
            imageDim: true,
            live2dExpression: 'sad'
        },
        'peace': {
            duration: 1200,
            orbRainbow: true,        // Color cycle
            orbFloat: true,
            imageRotation: 360,      // Full spin
            imageBounce: true,
            live2dExpression: 'happy'
        },
        'point': {
            duration: 600,
            orbPulse: true,
            orbScale: 1.1,
            imageTilt: 20,           // Lean toward
            live2dExpression: 'thinking'
        }
    };

    const config = animationConfigs[gesture];
    if (!config) return;

    gestureAnimation = {
        active: true,
        type: gesture,
        startTime: performance.now(),
        duration: config.duration,
        params: config,
        originalColor: currentModel?.orbConfig?.color || 0x00ff9d,
        originalScale: currentModel?.scale?.x || 1
    };

    // For Live2D, try to set expression (expressions don't have audio)
    if (currentAvatarType === 'live2d' && currentModel && config.live2dExpression) {
        try {
            // Live2D expressions are safe (no embedded audio)
            if (currentModel.internalModel?.motionManager?.expressionManager) {
                currentModel.internalModel.motionManager.expressionManager.setExpression(config.live2dExpression);
            }
        } catch (e) {
            console.log('Expression not available:', e.message);
        }
    }
}

function updateGestureAnimation() {
    if (!gestureAnimation.active || !currentModel) return;

    const elapsed = performance.now() - gestureAnimation.startTime;
    const progress = Math.min(elapsed / gestureAnimation.duration, 1);
    const params = gestureAnimation.params;

    // Easing function (ease out bounce)
    const easeOutBounce = (t) => {
        if (t < 1 / 2.75) return 7.5625 * t * t;
        if (t < 2 / 2.75) return 7.5625 * (t -= 1.5 / 2.75) * t + 0.75;
        if (t < 2.5 / 2.75) return 7.5625 * (t -= 2.25 / 2.75) * t + 0.9375;
        return 7.5625 * (t -= 2.625 / 2.75) * t + 0.984375;
    };

    // Ease in-out for smooth animations
    const easeInOut = (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;

    // Return to normal as animation ends
    const returnProgress = progress > 0.6 ? (progress - 0.6) / 0.4 : 0;
    const animProgress = progress < 0.6 ? progress / 0.6 : 1;

    switch (currentAvatarType) {
        case 'orb':
            updateOrbGestureAnimation(params, animProgress, returnProgress, easeOutBounce);
            break;
        case 'image':
            updateImageGestureAnimation(params, animProgress, returnProgress, easeInOut);
            break;
        case 'live2d':
            // Live2D uses expressions set in triggerGestureAnimation
            // Could add scale bounce here if desired
            if (params.orbScale && currentModel) {
                const scaleEffect = 1 + (params.orbScale - 1) * easeOutBounce(animProgress) * (1 - returnProgress);
                currentModel.scale.set(gestureAnimation.originalScale * scaleEffect);
            }
            break;
    }

    // End animation
    if (progress >= 1) {
        gestureAnimation.active = false;
        // Reset to original state
        if (currentModel) {
            currentModel.scale.set(gestureAnimation.originalScale);
            currentModel.rotation = 0;
        }
    }
}

function updateOrbGestureAnimation(params, animProgress, returnProgress, ease) {
    if (!currentModel || !orbGraphics) return;

    const container = currentModel;
    const baseSize = container.baseSize || 150;

    // Scale animation
    if (params.orbScale) {
        const targetScale = params.orbScale;
        const scaleEffect = 1 + (targetScale - 1) * ease(animProgress) * (1 - returnProgress);
        container.scale.set(scaleEffect);
    }

    // Shake animation (for thumbs down)
    if (params.orbShake) {
        const shakeIntensity = 10 * (1 - returnProgress);
        const shake = Math.sin(animProgress * Math.PI * 8) * shakeIntensity;
        container.x = (container.parent?.width || window.innerWidth) / 2 + shake;
    }

    // Wobble animation (for wave)
    if (params.orbWobble) {
        const wobble = Math.sin(animProgress * Math.PI * 4) * 0.1;
        container.skew.set(wobble, -wobble * 0.5);
    } else {
        container.skew.set(0, 0);
    }

    // Float animation (for peace)
    if (params.orbFloat) {
        const floatY = Math.sin(animProgress * Math.PI * 2) * 20;
        const baseY = (container.parent?.height || window.innerHeight) / 2;
        container.y = baseY - floatY * (1 - returnProgress);
    }

    // Color flash - redraw orb with new color
    if (params.orbColor && animProgress < 0.5) {
        const flashColor = params.orbColor;
        orbGraphics.clear();
        orbGraphics.beginFill(flashColor, 0.9);
        orbGraphics.drawCircle(0, 0, baseSize);
        orbGraphics.endFill();
    } else if (params.orbColor && animProgress >= 0.5) {
        // Return to original color
        orbGraphics.clear();
        orbGraphics.beginFill(gestureAnimation.originalColor, 0.9);
        orbGraphics.drawCircle(0, 0, baseSize);
        orbGraphics.endFill();
    }

    // Rainbow cycle (for peace)
    if (params.orbRainbow) {
        const hue = (animProgress * 360) % 360;
        const rainbowColor = hslToHex(hue, 100, 50);
        orbGraphics.clear();
        orbGraphics.beginFill(rainbowColor, 0.9);
        orbGraphics.drawCircle(0, 0, baseSize);
        orbGraphics.endFill();
    }

    // Pulse glow
    if (params.orbPulse && container.glowGraphics) {
        const pulseScale = 1 + Math.sin(animProgress * Math.PI * 4) * 0.3;
        container.glowGraphics.scale.set(pulseScale);
        container.glowGraphics.alpha = 0.5 + Math.sin(animProgress * Math.PI * 4) * 0.3;
    }
}

function updateImageGestureAnimation(params, animProgress, returnProgress, ease) {
    if (!currentModel || !imageSprite) return;

    const container = currentModel;
    const baseScale = container.baseScale || 1;

    // Scale pop (for thumbs up)
    if (params.imageScale) {
        const targetScale = params.imageScale;
        const scaleEffect = 1 + (targetScale - 1) * ease(animProgress) * (1 - returnProgress);
        imageSprite.scale.set(baseScale * scaleEffect);
    }

    // Rotation (for peace - full spin, for wave - wiggle)
    if (params.imageRotation) {
        const targetRotation = params.imageRotation * (Math.PI / 180);
        if (params.imageRotation >= 360) {
            // Full spin
            imageSprite.rotation = targetRotation * animProgress * (1 - returnProgress * 0.5);
        } else {
            // Wiggle
            imageSprite.rotation = Math.sin(animProgress * Math.PI * 4) * targetRotation * (1 - returnProgress);
        }
    }

    // Bounce (for wave, peace)
    if (params.imageBounce) {
        const bounceY = Math.abs(Math.sin(animProgress * Math.PI * 3)) * 30;
        const baseY = (container.parent?.height || window.innerHeight) / 2;
        container.y = baseY - bounceY * (1 - returnProgress);
    }

    // Shake (for thumbs down)
    if (params.imageShake) {
        const shakeIntensity = 15 * (1 - returnProgress);
        const shake = Math.sin(animProgress * Math.PI * 10) * shakeIntensity;
        container.x = (container.parent?.width || window.innerWidth) / 2 + shake;
    }

    // Dim (for thumbs down)
    if (params.imageDim) {
        imageSprite.alpha = 1 - 0.4 * ease(animProgress) * (1 - returnProgress);
    } else {
        imageSprite.alpha = 1;
    }

    // Tilt (for point)
    if (params.imageTilt) {
        const tiltAngle = params.imageTilt * (Math.PI / 180);
        imageSprite.rotation = tiltAngle * ease(animProgress) * (1 - returnProgress);
    }

    // Glow color change
    if (params.imageGlow && container.glowGraphics) {
        container.glowGraphics.alpha = 0.3 + 0.5 * ease(animProgress) * (1 - returnProgress);
    }
}

// Helper: HSL to Hex color
function hslToHex(h, s, l) {
    s /= 100;
    l /= 100;
    const a = s * Math.min(l, 1 - l);
    const f = n => {
        const k = (n + h / 30) % 12;
        const color = l - a * Math.max(Math.min(k - 3, 9 - k, 1), -1);
        return Math.round(255 * color);
    };
    return (f(0) << 16) + (f(8) << 8) + f(4);
}

function showGestureReaction(message) {
    // Create floating reaction element
    const reaction = document.createElement('div');
    reaction.className = 'gesture-reaction';
    reaction.textContent = message;
    reaction.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: rgba(0, 0, 0, 0.8);
        color: white;
        padding: 16px 24px;
        border-radius: 12px;
        font-size: 24px;
        z-index: 200;
        animation: gesturePopup 1.5s ease-out forwards;
        pointer-events: none;
    `;
    document.body.appendChild(reaction);

    // Remove after animation
    setTimeout(() => reaction.remove(), 1500);
}

// ========== Client Tool UI Functions ==========
function showNotification(message, type = 'info') {
    const notification = document.createElement('div');
    notification.className = `tool-notification ${type}`;

    const colors = {
        info: 'rgba(0, 100, 255, 0.9)',
        success: 'rgba(0, 200, 100, 0.9)',
        warning: 'rgba(255, 150, 0, 0.9)',
        error: 'rgba(255, 50, 50, 0.9)'
    };

    notification.style.cssText = `
        position: fixed;
        top: 80px;
        right: 20px;
        background: ${colors[type] || colors.info};
        color: white;
        padding: 12px 20px;
        border-radius: 8px;
        font-size: 14px;
        z-index: 300;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    `;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.animation = 'slideOut 0.3s ease-in forwards';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

function showProductCard({ title, description, price }) {
    // Remove existing card if present
    const existing = document.getElementById('product-card');
    if (existing) existing.remove();

    const card = document.createElement('div');
    card.id = 'product-card';
    card.style.cssText = `
        position: fixed;
        bottom: 100px;
        right: 20px;
        width: 280px;
        background: rgba(20, 20, 30, 0.95);
        border: 1px solid rgba(255,255,255,0.1);
        border-radius: 12px;
        padding: 20px;
        z-index: 250;
        animation: slideIn 0.3s ease-out;
        box-shadow: 0 8px 32px rgba(0,0,0,0.4);
    `;

    card.innerHTML = `
        <h3 style="color: #00ff9d; margin: 0 0 8px 0; font-size: 16px;">${title || 'Product'}</h3>
        <p style="color: #ccc; margin: 0 0 12px 0; font-size: 13px; line-height: 1.4;">${description || ''}</p>
        ${price ? `<p style="color: #fff; margin: 0; font-size: 18px; font-weight: bold;">$${price}</p>` : ''}
        <button onclick="this.parentElement.remove()" style="
            position: absolute;
            top: 8px;
            right: 8px;
            background: none;
            border: none;
            color: #666;
            cursor: pointer;
            font-size: 18px;
        ">&times;</button>
    `;

    document.body.appendChild(card);

    // Auto-remove after 10 seconds
    setTimeout(() => card.remove(), 10000);
}

function showActionButtons(actions) {
    if (!actions || !actions.length) return;

    // Remove existing actions
    const existing = document.getElementById('action-buttons');
    if (existing) existing.remove();

    const container = document.createElement('div');
    container.id = 'action-buttons';
    container.style.cssText = `
        position: fixed;
        bottom: 100px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        gap: 10px;
        z-index: 250;
        animation: slideIn 0.3s ease-out;
    `;

    actions.forEach(action => {
        const btn = document.createElement('button');
        btn.textContent = action.label || action;
        btn.style.cssText = `
            background: rgba(0, 255, 157, 0.2);
            border: 1px solid rgba(0, 255, 157, 0.5);
            color: #00ff9d;
            padding: 10px 20px;
            border-radius: 20px;
            cursor: pointer;
            font-size: 14px;
            transition: all 0.2s;
        `;
        btn.onmouseover = () => btn.style.background = 'rgba(0, 255, 157, 0.4)';
        btn.onmouseout = () => btn.style.background = 'rgba(0, 255, 157, 0.2)';
        btn.onclick = () => {
            // Send the action as user message
            if (conversation && conversation.sendMessage) {
                conversation.sendMessage(action.value || action.label || action);
            }
            container.remove();
        };
        container.appendChild(btn);
    });

    document.body.appendChild(container);

    // Auto-remove after 15 seconds
    setTimeout(() => container.remove(), 15000);
}

function addSystemMessage(text) {
    addToTranscript({ type: 'system', message: text, source: 'system' });
}

function toggleHandTracking() {
    if (handTrackingActive) {
        // Disable hand tracking
        handTrackingActive = false;
        if (videoElement) {
            videoElement.srcObject?.getTracks().forEach(t => t.stop());
            videoElement.remove();
        }
        if (canvasElement) canvasElement.remove();
        videoElement = null;
        canvasElement = null;
        addSystemMessage('Hand tracking disabled - using mouse');
    } else {
        // Enable hand tracking
        initHandTracking();
    }
}

function startUpdateLoop() {
    app.ticker.add(() => {
        // Decay volume when no audio
        if (smoothedVolume > 0.01) {
            smoothedVolume *= 0.85; // Slower decay for smoother animation
        } else {
            smoothedVolume = 0;
        }

        // Update avatar based on type
        switch (currentAvatarType) {
            case 'live2d':
                // Apply lip sync to Live2D model
                if (currentModel && smoothedVolume > 0) {
                    setMouthOpen(currentModel, smoothedVolume);
                }
                break;
            case 'orb':
                updateOrbAvatar();
                break;
            case 'image':
                updateImageAvatar();
                break;
        }

        // Update gesture animations (runs for all avatar types)
        updateGestureAnimation();
    });
}

// ========== ElevenLabs Conversational AI ==========
async function getSignedUrl() {
    // Always read the current value from the dropdown (in case change event didn't fire)
    const characterSelect = document.getElementById('characterSelect');
    if (characterSelect) {
        selectedCharacter = characterSelect.value;
    }

    const character = selectedCharacter || 'zay';
    const url = `/voice-assistant/api/signed-url?character=${character}`;
    console.log(`🎭 Getting signed URL for character: ${CHARACTERS[character]?.name || character} (${character})`);

    const response = await fetch(url);
    if (!response.ok) {
        throw new Error('Failed to get signed URL');
    }
    const data = await response.json();
    console.log(`✅ Got signed URL for agent: ${data.agentId}, character: ${data.character}`);
    return data.signedUrl;
}

async function startConversation() {
    const startBtn = document.getElementById('startBtn');
    const endBtn = document.getElementById('endBtn');

    try {
        updateStatus('connecting', 'Connecting...');

        // Request mic permission
        await navigator.mediaDevices.getUserMedia({ audio: true });

        // Get signed URL
        const signedUrl = await getSignedUrl();

        // Set up audio analysis for lip sync
        setupAudioAnalysis();

        // Start ElevenLabs conversation with client tools
        conversation = await Conversation.startSession({
            signedUrl: signedUrl,

            // Client-side tools the agent can call
            clientTools: {
                // Show notification when agent is looking something up
                show_searching: async ({ message }) => {
                    showNotification(message || 'Searching...', 'info');
                    return { acknowledged: true };
                },

                // Display product/service information
                show_product_info: async ({ title, description, price }) => {
                    showProductCard({ title, description, price });
                    return { displayed: true };
                },

                // End conversation gracefully
                end_call: async ({ reason }) => {
                    console.log('Agent requested call end:', reason);
                    setTimeout(() => endConversation(), 1000);
                    return { ending: true };
                },

                // Show quick action buttons
                show_actions: async ({ actions }) => {
                    showActionButtons(actions);
                    return { displayed: true };
                }
            },

            onConnect: () => {
                console.log('🎙️ Connected to ElevenLabs');
                isConnected = true;
                updateStatus('connected', 'Connected - speak now!');
                if (startBtn) startBtn.disabled = true;
                if (endBtn) endBtn.disabled = false;
                enableTextInput(true);
            },

            onDisconnect: () => {
                console.log('🔌 Disconnected');
                isConnected = false;
                updateStatus('disconnected', 'Disconnected');
                if (startBtn) startBtn.disabled = false;
                if (endBtn) endBtn.disabled = true;
                enableTextInput(false);
                cleanupAudioAnalysis();
            },

            onError: (error) => {
                console.error('❌ Error:', error);
                updateStatus('error', 'Connection error');
            },

            onModeChange: (mode) => {
                console.log('Mode:', mode);
                if (mode.mode === 'speaking') {
                    updateStatus('speaking', 'AI Speaking...');
                    // Delay lip sync start to sync with audio buffer (~200ms)
                    setTimeout(() => {
                        if (isConnected) startLipSyncFromAudio();
                    }, 200);
                } else {
                    updateStatus('listening', 'Listening...');
                    stopLipSync();
                }
            },

            onMessage: (message) => {
                console.log('Message:', message);
                addToTranscript(message);
            }
        });

    } catch (error) {
        console.error('Failed to start:', error);
        updateStatus('error', error.message);
        if (startBtn) startBtn.disabled = false;
    }
}

async function endConversation() {
    const startBtn = document.getElementById('startBtn');
    const endBtn = document.getElementById('endBtn');

    try {
        if (conversation) {
            await conversation.endSession();
            conversation = null;
        }
        cleanupAudioAnalysis();
    } catch (error) {
        console.error('Error ending conversation:', error);
    }

    isConnected = false;
    updateStatus('disconnected', 'Click Start to begin');
    if (startBtn) startBtn.disabled = false;
    if (endBtn) endBtn.disabled = true;
}

// ========== Audio Analysis for Lip Sync ==========
let audioAnalysisRunning = false;
let lipSyncAnimationId = null;

function setupAudioAnalysis() {
    try {
        // Create audio context for analysis
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 256; // Smaller for faster processing
        analyser.smoothingTimeConstant = 0.3; // Less smoothing for more responsive animation

        // Hook into browser audio output by monitoring all audio elements
        setupAudioCapture();

        console.log('🎤 Audio analysis initialized');
    } catch (err) {
        console.error('Audio analysis setup failed:', err);
    }
}

function setupAudioCapture() {
    // Monitor for audio elements created by ElevenLabs SDK
    const observer = new MutationObserver((mutations) => {
        mutations.forEach((mutation) => {
            mutation.addedNodes.forEach((node) => {
                if (node.nodeName === 'AUDIO') {
                    captureAudioElement(node);
                }
                // Also check children
                if (node.querySelectorAll) {
                    node.querySelectorAll('audio').forEach(captureAudioElement);
                }
            });
        });
    });

    observer.observe(document.body, { childList: true, subtree: true });

    // Also capture any existing audio elements
    document.querySelectorAll('audio').forEach(captureAudioElement);

    // Fallback: Hook into AudioContext.createMediaStreamSource
    const originalCreateMediaStreamSource = AudioContext.prototype.createMediaStreamSource;
    AudioContext.prototype.createMediaStreamSource = function(stream) {
        const source = originalCreateMediaStreamSource.call(this, stream);
        console.log('🎤 Captured media stream source');

        // Try to connect to our analyser if it's the output stream
        try {
            if (analyser && this === audioContext) {
                source.connect(analyser);
            }
        } catch (e) {
            // Ignore connection errors
        }

        return source;
    };
}

function captureAudioElement(audioElement) {
    if (!audioElement || audioElement._lipSyncCaptured) return;
    audioElement._lipSyncCaptured = true;

    try {
        // Create a media element source and connect to analyser
        const source = audioContext.createMediaElementSource(audioElement);
        source.connect(analyser);
        analyser.connect(audioContext.destination);

        console.log('🎤 Captured audio element for lip sync');
    } catch (err) {
        // Element might already be captured or not playable
        console.log('Could not capture audio element:', err.message);
    }
}

// Real-time lip sync using audio analysis
function startLipSyncFromAudio() {
    if (audioAnalysisRunning) return;
    audioAnalysisRunning = true;

    const dataArray = new Uint8Array(analyser ? analyser.frequencyBinCount : 128);
    let lastVolume = 0;

    function analyzeLipSync() {
        if (!audioAnalysisRunning) {
            smoothedVolume = 0;
            return;
        }

        lipSyncAnimationId = requestAnimationFrame(analyzeLipSync);

        // Check if we're supposed to be speaking
        const statusText = document.getElementById('statusText');
        const isSpeaking = statusText && statusText.textContent.includes('Speaking');

        if (!isSpeaking) {
            // Smoothly close mouth when not speaking
            smoothedVolume = smoothedVolume * 0.8;
            if (smoothedVolume < 0.01) smoothedVolume = 0;
            return;
        }

        // Try to get real audio data
        let volume = 0;

        if (analyser) {
            try {
                analyser.getByteFrequencyData(dataArray);

                // Calculate RMS volume from frequency data
                let sum = 0;
                const len = dataArray.length;
                for (let i = 0; i < len; i++) {
                    const val = dataArray[i] / 255;
                    sum += val * val;
                }
                volume = Math.sqrt(sum / len);

                // Boost and clamp
                volume = Math.min(volume * 3.5, 1);
            } catch (e) {
                // Analyser not ready, use fallback
                volume = 0;
            }
        }

        // If no real audio detected but we're speaking, use enhanced fallback
        if (volume < 0.05 && isSpeaking) {
            // Simulate natural speech patterns - syllables at ~4-5 per second
            const time = Date.now() / 1000;

            // Primary syllable rhythm (~4.5 syllables/sec = 9 rad/sec for open/close)
            const syllables = Math.sin(time * 9) * 0.35;

            // Word boundaries - brief pauses every ~0.4 sec
            const words = Math.sin(time * 2.5) * 0.15;

            // Sentence rhythm - emphasis variation
            const emphasis = Math.sin(time * 0.8) * 0.1;

            // Combine patterns
            const speechPattern = syllables + words + emphasis + 0.5;

            // Clamp and add micro-variation
            volume = Math.max(0.15, Math.min(0.95, speechPattern + (Math.random() - 0.5) * 0.1));
        }

        // Smooth the volume changes for natural movement
        // Fast attack (mouth opens quickly), slower release (closes more smoothly)
        if (volume > lastVolume) {
            smoothedVolume = smoothedVolume * 0.3 + volume * 0.7; // Fast attack
        } else {
            smoothedVolume = smoothedVolume * 0.6 + volume * 0.4; // Slower release
        }

        lastVolume = volume;
    }

    analyzeLipSync();
}

function stopLipSync() {
    audioAnalysisRunning = false;
    if (lipSyncAnimationId) {
        cancelAnimationFrame(lipSyncAnimationId);
        lipSyncAnimationId = null;
    }
    // Smoothly close mouth
    const closeInterval = setInterval(() => {
        smoothedVolume *= 0.7;
        if (smoothedVolume < 0.01) {
            smoothedVolume = 0;
            clearInterval(closeInterval);
        }
    }, 30);
}

function cleanupAudioAnalysis() {
    audioAnalysisRunning = false;
    if (lipSyncAnimationId) {
        cancelAnimationFrame(lipSyncAnimationId);
        lipSyncAnimationId = null;
    }
    if (audioContext && audioContext.state !== 'closed') {
        audioContext.close();
    }
    audioContext = null;
    analyser = null;
}

// ========== UI Helpers ==========
function enableTextInput(enabled) {
    const chatInput = document.getElementById('chatInput');
    const sendBtn = document.getElementById('sendBtn');

    if (chatInput) {
        chatInput.disabled = !enabled;
        chatInput.placeholder = enabled ? 'Type a message...' : 'Start conversation first';
    }
    if (sendBtn) {
        sendBtn.disabled = !enabled;
    }
}

function updateStatus(state, message) {
    const statusDot = document.getElementById('statusDot');
    const statusText = document.getElementById('statusText');

    if (statusDot) {
        statusDot.className = 'status-dot ' + state;
    }
    if (statusText) {
        statusText.textContent = message || state;
    }
}

function addToTranscript(message) {
    const display = document.getElementById('chatDisplay');
    if (!display) return;

    const content = message.message || message.text || message.content || '';
    if (!content) return;

    const isUser = message.type === 'user' || message.source === 'user';

    // Clear empty state if present
    const emptyState = display.querySelector('.empty-state');
    if (emptyState) emptyState.remove();

    // Create message element
    const div = document.createElement('div');
    div.className = `chat-message ${isUser ? 'user' : 'assistant'}`;
    div.textContent = content;

    // Add timestamp
    const timestamp = document.createElement('span');
    timestamp.className = 'timestamp';
    timestamp.textContent = new Date().toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
    div.appendChild(timestamp);

    display.appendChild(div);
    display.scrollTop = display.scrollHeight;

    // Store in chat history for export (if available)
    if (typeof window.addMessageToHistory === 'function') {
        window.addMessageToHistory(isUser ? 'user' : 'assistant', content);
    } else if (window.chatHistory) {
        // Fallback: direct push
        window.chatHistory.push({
            role: isUser ? 'user' : 'assistant',
            content,
            character: isUser ? 'You' : (window.currentCharacter || 'AI'),
            timestamp: new Date()
        });
    }

    // Update floating subtitle for AI messages
    if (!isUser) {
        lastAIMessage = content;
        updateFloatingSubtitle();
    }
}

// Play audio and sync lips for text input responses
async function playAIAudioFromUrl(audioUrl) {
    try {
        const response = await fetch(audioUrl);
        const arrayBuffer = await response.arrayBuffer();

        const tempContext = new (window.AudioContext || window.webkitAudioContext)();
        const audioBuffer = await tempContext.decodeAudioData(arrayBuffer);

        // Create nodes
        const source = tempContext.createBufferSource();
        const tempAnalyser = tempContext.createAnalyser();
        tempAnalyser.fftSize = 512;
        tempAnalyser.smoothingTimeConstant = 0.4;

        source.buffer = audioBuffer;
        source.connect(tempAnalyser);
        tempAnalyser.connect(tempContext.destination);

        // Start playback and lip sync
        source.start(0);
        updateStatus('speaking', 'AI Speaking...');

        // Lip sync loop
        const analyzeLoop = () => {
            if (source.context.state === 'closed') return;

            const dataArray = new Uint8Array(tempAnalyser.frequencyBinCount);
            tempAnalyser.getByteFrequencyData(dataArray);

            let sum = 0;
            for (let i = 0; i < dataArray.length; i++) {
                const val = dataArray[i] / 255;
                sum += val * val;
            }
            const rms = Math.sqrt(sum / dataArray.length);
            const targetVolume = Math.min(rms * 3, 1);

            if (targetVolume > smoothedVolume) {
                smoothedVolume = smoothedVolume * 0.3 + targetVolume * 0.7;
            } else {
                smoothedVolume = smoothedVolume * 0.7 + targetVolume * 0.3;
            }

            requestAnimationFrame(analyzeLoop);
        };
        analyzeLoop();

        // Cleanup when done
        source.onended = () => {
            smoothedVolume = 0;
            tempContext.close();
            updateStatus(isConnected ? 'listening' : 'disconnected',
                         isConnected ? 'Listening...' : 'Click Start to begin');
        };

    } catch (err) {
        console.error('Audio playback failed:', err);
    }
}

// Cleanup on page unload
window.addEventListener('beforeunload', () => {
    if (conversation) {
        conversation.endSession();
    }
});
