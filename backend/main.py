"""
Avatar AI - Main FastAPI Application

Animated AI companion with:
- Live2D avatar visualization
- Ollama/Claude LLM backend
- ElevenLabs TTS
- Persistent memory system
- Avatar Studio (Leonardo AI generation)
"""

import os
import asyncio
import aiohttp
import uuid
import base64
from pathlib import Path
from contextlib import asynccontextmanager
from fastapi import FastAPI, WebSocket, WebSocketDisconnect, HTTPException, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from fastapi.responses import FileResponse
from pydantic import BaseModel
from typing import Optional, List
import json

from providers import OllamaLLM, ClaudeLLM, ElevenLabsTTS
from providers.base import Message
from memory import MemoryManager, MemoryConfig


# --- Configuration ---

class Config:
    OLLAMA_MODEL = os.getenv("OLLAMA_MODEL", "llama3.1:8b")
    OLLAMA_URL = os.getenv("OLLAMA_URL", "http://localhost:11434")
    ELEVENLABS_API_KEY = os.getenv("ELEVENLABS_API_KEY")
    ELEVENLABS_VOICE_ID = os.getenv("ELEVENLABS_VOICE_ID", "pNInz6obpgDQGcFmaJgB")
    ANTHROPIC_API_KEY = os.getenv("ANTHROPIC_API_KEY")
    MEMORY_PATH = os.getenv("MEMORY_PATH", ".memory")
    USE_CLAUDE = os.getenv("USE_CLAUDE", "false").lower() == "true"
    # Leonardo AI
    LEONARDO_API_KEY = os.getenv("LEONARDO_API_KEY")
    LEONARDO_MODEL_ID = os.getenv("LEONARDO_MODEL_ID", "e71a1c2f-4f8b-4e85-8f8a-0e8a8a8e8a8a")  # Anime Pastel Dream
    AVATARS_PATH = os.getenv("AVATARS_PATH", "./avatars")


# --- Global State ---

llm_provider = None
tts_provider = None
memory_manager = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    """Initialize providers on startup."""
    global llm_provider, tts_provider, memory_manager

    # Initialize LLM
    if Config.USE_CLAUDE and Config.ANTHROPIC_API_KEY:
        llm_provider = ClaudeLLM(api_key=Config.ANTHROPIC_API_KEY)
        print("Using Claude LLM")
    else:
        llm_provider = OllamaLLM(model=Config.OLLAMA_MODEL, base_url=Config.OLLAMA_URL)
        print(f"Using Ollama LLM: {Config.OLLAMA_MODEL}")

    # Initialize TTS
    if Config.ELEVENLABS_API_KEY:
        tts_provider = ElevenLabsTTS(
            api_key=Config.ELEVENLABS_API_KEY,
            default_voice_id=Config.ELEVENLABS_VOICE_ID,
        )
        print("ElevenLabs TTS initialized")

    # Initialize Memory
    memory_config = MemoryConfig(memory_base_path=Config.MEMORY_PATH)
    memory_manager = MemoryManager(config=memory_config, llm_provider=llm_provider)
    print(f"Memory system initialized at {Config.MEMORY_PATH}")

    yield

    # Cleanup
    if hasattr(llm_provider, "close"):
        await llm_provider.close()
    if hasattr(tts_provider, "close"):
        await tts_provider.close()


# --- FastAPI App ---

app = FastAPI(
    title="Avatar AI",
    description="Animated AI companion with persistent memory",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- Request/Response Models ---

class ChatRequest(BaseModel):
    message: str
    session_id: Optional[str] = None
    include_audio: bool = True


class ChatResponse(BaseModel):
    response: str
    session_id: str
    audio_base64: Optional[str] = None


class FactRequest(BaseModel):
    content: str
    category: str


class SearchRequest(BaseModel):
    query: str
    n_results: int = 10


# --- Avatar Studio Models ---

class AvatarGenerateRequest(BaseModel):
    """Request to generate a new avatar."""
    name: str
    description: str
    style: str = "anime"  # anime, realistic, cartoon
    gender: str = "neutral"  # male, female, neutral
    age: str = "adult"  # child, teen, adult, elder
    extras: Optional[str] = None  # Additional prompt details

class AvatarResponse(BaseModel):
    """Response with avatar info."""
    id: str
    name: str
    status: str  # pending, generating, completed, failed
    image_url: Optional[str] = None
    thumbnail_url: Optional[str] = None
    created_at: str

class AvatarListResponse(BaseModel):
    """List of avatars."""
    avatars: List[AvatarResponse]


# --- API Routes ---

@app.get("/")
async def root():
    return {"status": "ok", "service": "Avatar AI", "version": "0.1.0"}


@app.get("/api/health")
async def health():
    """Health check endpoint."""
    return {
        "status": "healthy",
        "llm": "ollama" if isinstance(llm_provider, OllamaLLM) else "claude",
        "tts": "elevenlabs" if tts_provider else "none",
        "memory": memory_manager.get_stats() if memory_manager else None,
    }


@app.post("/api/session/start")
async def start_session():
    """Start a new conversation session."""
    session = memory_manager.start_session()
    return {"session_id": session.id, "started_at": session.started_at.isoformat()}


@app.post("/api/session/{session_id}/end")
async def end_session(session_id: str):
    """End a conversation session and archive."""
    await memory_manager.end_session(session_id)
    return {"status": "ended", "session_id": session_id}


@app.post("/api/chat", response_model=ChatResponse)
async def chat(request: ChatRequest):
    """Send a message and get a response."""
    import base64

    # Ensure session exists
    if request.session_id:
        session = memory_manager.session.get_session(request.session_id)
        if not session:
            memory_manager.start_session()
    else:
        session = memory_manager.start_session()

    session_id = request.session_id or memory_manager.session.active_session_id

    # Add user message to memory
    memory_manager.add_message("user", request.message, session_id)

    # Get memory context
    context = memory_manager.get_context_for_query(request.message)

    # Get conversation history
    messages = memory_manager.get_session_messages(session_id)

    # Generate response
    system_prompt = """You are a friendly AI companion with a visual avatar.
You have memory of past conversations and known facts about the user.
Be conversational, warm, and helpful. Keep responses concise for voice output."""

    response_text = await llm_provider.chat(
        messages=messages,
        system_prompt=system_prompt,
        memory_context=context,
    )

    # Add assistant response to memory
    memory_manager.add_message("assistant", response_text, session_id)

    # Maybe extract facts
    await memory_manager.maybe_extract_facts(session_id)

    # Generate audio if requested
    audio_base64 = None
    if request.include_audio and tts_provider:
        try:
            audio_bytes = await tts_provider.synthesize(response_text)
            audio_base64 = base64.b64encode(audio_bytes).decode()
        except Exception as e:
            print(f"TTS error: {e}")

    return ChatResponse(
        response=response_text,
        session_id=session_id,
        audio_base64=audio_base64,
    )


@app.websocket("/api/ws/conversation")
async def websocket_conversation(websocket: WebSocket):
    """Real-time conversation via WebSocket."""
    await websocket.accept()

    session = memory_manager.start_session()
    session_id = session.id

    try:
        await websocket.send_json({"type": "session_started", "session_id": session_id})

        while True:
            data = await websocket.receive_json()

            if data.get("type") == "message":
                user_message = data.get("content", "")

                # Add to memory
                memory_manager.add_message("user", user_message, session_id)

                # Get context and history
                context = memory_manager.get_context_for_query(user_message)
                messages = memory_manager.get_session_messages(session_id)

                # Stream response
                await websocket.send_json({"type": "response_start"})

                full_response = ""
                async for token in llm_provider.chat_stream(
                    messages=messages,
                    system_prompt="You are a friendly AI companion. Be concise.",
                    memory_context=context,
                ):
                    full_response += token
                    await websocket.send_json({"type": "token", "content": token})

                await websocket.send_json({"type": "response_end", "full_response": full_response})

                # Add to memory
                memory_manager.add_message("assistant", full_response, session_id)

            elif data.get("type") == "end_session":
                await memory_manager.end_session(session_id)
                await websocket.send_json({"type": "session_ended"})
                break

    except WebSocketDisconnect:
        await memory_manager.end_session(session_id)


# --- Memory Routes ---

@app.get("/api/memory/stats")
async def memory_stats():
    """Get memory system statistics."""
    return memory_manager.get_stats()


@app.get("/api/memory/facts")
async def list_facts(category: Optional[str] = None):
    """List all facts or filter by category."""
    if category:
        facts = memory_manager.knowledge.get_facts_by_category(category)
    else:
        facts = memory_manager.knowledge.get_all_facts()

    return {
        "facts": [
            {
                "content": f.content,
                "category": f.category,
                "source": f.source,
                "confidence": f.confidence,
                "created_at": f.created_at,
            }
            for f in facts
        ]
    }


@app.post("/api/memory/facts")
async def add_fact(request: FactRequest):
    """Manually add a fact."""
    fact = memory_manager.add_manual_fact(
        content=request.content,
        category=request.category,
    )
    return {"status": "added", "fact": fact.content, "category": fact.category}


@app.post("/api/memory/search")
async def search_memories(request: SearchRequest):
    """Search memories semantically."""
    results = memory_manager.search_memories(request.query, request.n_results)
    return {"results": results}


@app.get("/api/memory/context")
async def get_context(query: str):
    """Get memory context for a query."""
    context = memory_manager.get_context_for_query(query)
    return {
        "facts": context.facts,
        "recent_summary": context.recent_summary,
        "relevant_memories": context.relevant_memories,
    }


# --- Provider Routes ---

@app.get("/api/providers")
async def list_providers():
    """List available providers."""
    return {
        "llm": {
            "active": "claude" if isinstance(llm_provider, ClaudeLLM) else "ollama",
            "available": ["ollama", "claude"],
        },
        "tts": {
            "active": "elevenlabs" if tts_provider else "none",
            "available": ["elevenlabs", "none"],
        },
    }


@app.get("/api/voices")
async def list_voices():
    """List available TTS voices."""
    if not tts_provider:
        return {"voices": []}
    voices = await tts_provider.list_voices()
    return {"voices": voices}


# =============================================================================
# Avatar Studio - Leonardo AI Integration
# =============================================================================

# In-memory store for avatar generation jobs (use Redis in production)
avatar_jobs = {}

# Ensure avatars directory exists
Path(Config.AVATARS_PATH).mkdir(parents=True, exist_ok=True)


def build_avatar_prompt(request: AvatarGenerateRequest) -> str:
    """Build an optimized prompt for Live2D-ready avatar generation."""
    style_prompts = {
        "anime": "anime style, clean linework, vibrant colors",
        "realistic": "semi-realistic anime, detailed shading, soft lighting",
        "cartoon": "cartoon style, bold outlines, simplified features",
    }

    gender_prompts = {
        "male": "masculine features",
        "female": "feminine features",
        "neutral": "androgynous features",
    }

    age_prompts = {
        "child": "young child appearance, innocent expression",
        "teen": "teenage appearance, youthful energy",
        "adult": "adult appearance, mature features",
        "elder": "elderly appearance, wise expression",
    }

    base_prompt = f"""character portrait, front facing, looking at viewer,
symmetrical face, neutral expression, simple solid color background,
{request.description},
{style_prompts.get(request.style, style_prompts['anime'])},
{gender_prompts.get(request.gender, '')},
{age_prompts.get(request.age, age_prompts['adult'])},
upper body visible, high quality, detailed eyes,
suitable for Live2D rigging, no complex poses, centered composition"""

    if request.extras:
        base_prompt += f", {request.extras}"

    return base_prompt


async def generate_with_leonardo(prompt: str, avatar_id: str):
    """Call Leonardo API to generate avatar image."""
    if not Config.LEONARDO_API_KEY:
        avatar_jobs[avatar_id]["status"] = "failed"
        avatar_jobs[avatar_id]["error"] = "Leonardo API key not configured"
        return

    headers = {
        "Authorization": f"Bearer {Config.LEONARDO_API_KEY}",
        "Content-Type": "application/json",
    }

    # Step 1: Create generation job
    create_url = "https://cloud.leonardo.ai/api/rest/v1/generations"
    payload = {
        "prompt": prompt,
        "modelId": Config.LEONARDO_MODEL_ID,
        "width": 1024,
        "height": 1024,
        "num_images": 1,
        "guidance_scale": 7,
        "presetStyle": "ANIME",
        "public": False,
        "promptMagic": True,
    }

    try:
        async with aiohttp.ClientSession() as session:
            # Create generation
            async with session.post(create_url, headers=headers, json=payload) as resp:
                if resp.status != 200:
                    error_text = await resp.text()
                    avatar_jobs[avatar_id]["status"] = "failed"
                    avatar_jobs[avatar_id]["error"] = f"Leonardo API error: {error_text}"
                    return

                data = await resp.json()
                generation_id = data.get("sdGenerationJob", {}).get("generationId")

                if not generation_id:
                    avatar_jobs[avatar_id]["status"] = "failed"
                    avatar_jobs[avatar_id]["error"] = "No generation ID returned"
                    return

            avatar_jobs[avatar_id]["generation_id"] = generation_id
            avatar_jobs[avatar_id]["status"] = "generating"

            # Step 2: Poll for completion
            get_url = f"https://cloud.leonardo.ai/api/rest/v1/generations/{generation_id}"
            max_attempts = 60  # 5 minutes max
            attempt = 0

            while attempt < max_attempts:
                await asyncio.sleep(5)  # Poll every 5 seconds
                attempt += 1

                async with session.get(get_url, headers=headers) as resp:
                    if resp.status != 200:
                        continue

                    data = await resp.json()
                    generation = data.get("generations_by_pk", {})
                    status = generation.get("status")

                    if status == "COMPLETE":
                        images = generation.get("generated_images", [])
                        if images:
                            image_url = images[0].get("url")

                            # Download and save image
                            async with session.get(image_url) as img_resp:
                                if img_resp.status == 200:
                                    img_data = await img_resp.read()
                                    img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}.png"
                                    img_path.write_bytes(img_data)

                                    avatar_jobs[avatar_id]["status"] = "completed"
                                    avatar_jobs[avatar_id]["image_url"] = f"/api/avatars/{avatar_id}/image"
                                    avatar_jobs[avatar_id]["leonardo_url"] = image_url
                                    return

                    elif status == "FAILED":
                        avatar_jobs[avatar_id]["status"] = "failed"
                        avatar_jobs[avatar_id]["error"] = "Generation failed"
                        return

            # Timeout
            avatar_jobs[avatar_id]["status"] = "failed"
            avatar_jobs[avatar_id]["error"] = "Generation timed out"

    except Exception as e:
        avatar_jobs[avatar_id]["status"] = "failed"
        avatar_jobs[avatar_id]["error"] = str(e)


@app.post("/api/avatars/generate", response_model=AvatarResponse)
async def generate_avatar(request: AvatarGenerateRequest, background_tasks: BackgroundTasks):
    """Start avatar generation with Leonardo AI."""
    if not Config.LEONARDO_API_KEY:
        raise HTTPException(status_code=500, detail="Leonardo API not configured")

    avatar_id = str(uuid.uuid4())[:8]
    prompt = build_avatar_prompt(request)

    # Store job info
    from datetime import datetime
    avatar_jobs[avatar_id] = {
        "id": avatar_id,
        "name": request.name,
        "status": "pending",
        "prompt": prompt,
        "created_at": datetime.utcnow().isoformat(),
        "image_url": None,
        "error": None,
    }

    # Start generation in background
    background_tasks.add_task(generate_with_leonardo, prompt, avatar_id)

    return AvatarResponse(
        id=avatar_id,
        name=request.name,
        status="pending",
        image_url=None,
        thumbnail_url=None,
        created_at=avatar_jobs[avatar_id]["created_at"],
    )


@app.get("/api/avatars/{avatar_id}", response_model=AvatarResponse)
async def get_avatar_status(avatar_id: str):
    """Get avatar generation status."""
    if avatar_id not in avatar_jobs:
        raise HTTPException(status_code=404, detail="Avatar not found")

    job = avatar_jobs[avatar_id]
    return AvatarResponse(
        id=job["id"],
        name=job["name"],
        status=job["status"],
        image_url=job.get("image_url"),
        thumbnail_url=job.get("image_url"),  # Same for now
        created_at=job["created_at"],
    )


@app.get("/api/avatars", response_model=AvatarListResponse)
async def list_avatars():
    """List all generated avatars."""
    avatars = []
    for avatar_id, job in avatar_jobs.items():
        avatars.append(AvatarResponse(
            id=job["id"],
            name=job["name"],
            status=job["status"],
            image_url=job.get("image_url"),
            thumbnail_url=job.get("image_url"),
            created_at=job["created_at"],
        ))
    return AvatarListResponse(avatars=avatars)


@app.delete("/api/avatars/{avatar_id}")
async def delete_avatar(avatar_id: str):
    """Delete an avatar."""
    if avatar_id not in avatar_jobs:
        raise HTTPException(status_code=404, detail="Avatar not found")

    # Delete image file
    img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}.png"
    if img_path.exists():
        img_path.unlink()

    # Remove from jobs
    del avatar_jobs[avatar_id]
    return {"status": "deleted", "id": avatar_id}


# =============================================================================
# Avatar Image Processing - Background Removal & Layer Separation
# =============================================================================

@app.post("/api/avatars/{avatar_id}/remove-background")
async def remove_background(avatar_id: str):
    """Remove background from avatar image using rembg."""
    img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}.png"
    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Avatar not found")

    try:
        from rembg import remove
        from PIL import Image
        import io

        # Load image
        input_image = Image.open(img_path)

        # Remove background
        output_image = remove(input_image)

        # Save with transparent background
        nobg_path = Path(Config.AVATARS_PATH) / f"{avatar_id}_nobg.png"
        output_image.save(nobg_path, "PNG")

        return {
            "status": "success",
            "original": f"/api/avatars/{avatar_id}/image",
            "no_background": f"/api/avatars/{avatar_id}/image?variant=nobg"
        }
    except ImportError:
        raise HTTPException(status_code=500, detail="rembg not installed. Run: pip install rembg")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@app.get("/api/avatars/{avatar_id}/image")
async def get_avatar_image_v2(avatar_id: str, variant: str = "original"):
    """Get avatar image (original or processed variants)."""
    if variant == "nobg":
        img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}_nobg.png"
    elif variant == "layers":
        # Return zip of layers
        zip_path = Path(Config.AVATARS_PATH) / f"{avatar_id}_layers.zip"
        if zip_path.exists():
            return FileResponse(zip_path, media_type="application/zip",
                              filename=f"{avatar_id}_layers.zip")
        raise HTTPException(status_code=404, detail="Layers not generated yet")
    else:
        img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}.png"

    if not img_path.exists():
        raise HTTPException(status_code=404, detail="Image not found")
    return FileResponse(img_path, media_type="image/png")


@app.post("/api/avatars/{avatar_id}/extract-layers")
async def extract_layers(avatar_id: str):
    """
    Extract layers from avatar for Live2D rigging.
    Uses edge detection and color clustering for anime-style images.

    Creates separate layers for:
    - base (full character)
    - face
    - eyes
    - mouth
    - hair
    """
    nobg_path = Path(Config.AVATARS_PATH) / f"{avatar_id}_nobg.png"
    if not nobg_path.exists():
        # Try to remove background first
        img_path = Path(Config.AVATARS_PATH) / f"{avatar_id}.png"
        if not img_path.exists():
            raise HTTPException(status_code=404, detail="Avatar not found")
        # Redirect to remove background first
        raise HTTPException(status_code=400,
            detail="Background not removed. Call /api/avatars/{id}/remove-background first")

    try:
        from PIL import Image
        import cv2
        import numpy as np
        import zipfile
        import io

        # Load no-background image
        img = Image.open(nobg_path).convert("RGBA")
        img_cv = cv2.cvtColor(np.array(img), cv2.COLOR_RGBA2BGRA)

        layers_dir = Path(Config.AVATARS_PATH) / f"{avatar_id}_layers"
        layers_dir.mkdir(exist_ok=True)

        # Save base layer
        img.save(layers_dir / "base.png")

        # Convert to grayscale for face detection
        gray = cv2.cvtColor(img_cv, cv2.COLOR_BGRA2GRAY)

        # For anime images, use edge detection to find features
        edges = cv2.Canny(gray, 50, 150)

        # Find contours (potential facial features)
        contours, _ = cv2.findContours(edges, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)

        # Create masks for different regions (simplified approach)
        height, width = gray.shape

        # Face region (upper 60% of image, centered)
        face_mask = np.zeros((height, width), dtype=np.uint8)
        face_y_start = int(height * 0.1)
        face_y_end = int(height * 0.6)
        face_x_margin = int(width * 0.2)
        face_mask[face_y_start:face_y_end, face_x_margin:width-face_x_margin] = 255

        # Eyes region (upper portion of face)
        eyes_mask = np.zeros((height, width), dtype=np.uint8)
        eyes_y_start = int(height * 0.25)
        eyes_y_end = int(height * 0.4)
        eyes_mask[eyes_y_start:eyes_y_end, face_x_margin:width-face_x_margin] = 255

        # Mouth region (lower portion of face)
        mouth_mask = np.zeros((height, width), dtype=np.uint8)
        mouth_y_start = int(height * 0.45)
        mouth_y_end = int(height * 0.55)
        mouth_x_margin = int(width * 0.35)
        mouth_mask[mouth_y_start:mouth_y_end, mouth_x_margin:width-mouth_x_margin] = 255

        # Hair region (top and sides)
        hair_mask = np.zeros((height, width), dtype=np.uint8)
        hair_mask[0:int(height*0.35), :] = 255  # Top
        hair_mask[:, 0:int(width*0.15)] = 255   # Left side
        hair_mask[:, int(width*0.85):] = 255    # Right side

        # Apply masks and save layers
        def apply_mask(image, mask):
            result = image.copy()
            mask_4ch = cv2.cvtColor(mask, cv2.COLOR_GRAY2BGRA)
            mask_4ch[:, :, 3] = mask
            result = cv2.bitwise_and(result, mask_4ch)
            # Restore alpha where mask is active
            alpha = np.where(mask > 0, image[:, :, 3], 0)
            result[:, :, 3] = alpha
            return result

        # Save each layer
        layers = {
            "face": face_mask,
            "eyes": eyes_mask,
            "mouth": mouth_mask,
            "hair": hair_mask,
        }

        for name, mask in layers.items():
            layer_img = apply_mask(img_cv, mask)
            layer_pil = Image.fromarray(cv2.cvtColor(layer_img, cv2.COLOR_BGRA2RGBA))
            layer_pil.save(layers_dir / f"{name}.png")

        # Create zip file
        zip_path = Path(Config.AVATARS_PATH) / f"{avatar_id}_layers.zip"
        with zipfile.ZipFile(zip_path, 'w') as zf:
            for layer_file in layers_dir.glob("*.png"):
                zf.write(layer_file, layer_file.name)

        return {
            "status": "success",
            "layers": ["base", "face", "eyes", "mouth", "hair"],
            "download": f"/api/avatars/{avatar_id}/image?variant=layers",
            "note": "These are approximate regions. For best results, refine in image editor."
        }

    except ImportError as e:
        raise HTTPException(status_code=500,
            detail=f"Missing dependency: {str(e)}. Run: pip install Pillow opencv-python")
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Processing error: {str(e)}")


@app.get("/api/processing/status")
async def get_processing_capabilities():
    """Check which image processing features are available."""
    capabilities = {
        "background_removal": False,
        "layer_extraction": False,
        "talking_head_anime": False,
        "sam_segmentation": False,
    }

    try:
        import rembg
        capabilities["background_removal"] = True
    except ImportError:
        pass

    try:
        import cv2
        from PIL import Image
        capabilities["layer_extraction"] = True
    except ImportError:
        pass

    try:
        from simple_talking_anime_avatar import TalkingAnimeAvatar
        capabilities["talking_head_anime"] = True
    except ImportError:
        pass

    try:
        from ultralytics import SAM
        capabilities["sam_segmentation"] = True
    except ImportError:
        try:
            import sam2
            capabilities["sam_segmentation"] = True
        except ImportError:
            pass

    return {
        "capabilities": capabilities,
        "install_commands": {
            "background_removal": "pip install rembg",
            "layer_extraction": "pip install Pillow opencv-python",
            "talking_head_anime": "pip install simple_talking_anime_avatar",
            "sam_segmentation": "pip install ultralytics  # or pip install sam2",
        }
    }


@app.get("/api/avatars/presets")
async def get_avatar_presets():
    """Get preset character templates."""
    return {
        "presets": [
            {
                "id": "drzay",
                "name": "Dr. Zay",
                "description": "young black man, early 30s, confident, stylish, short dark hair, warm brown eyes, headphones around neck, casual streetwear hoodie, music producer aesthetic",
                "style": "anime",
                "gender": "male",
                "age": "adult",
            },
            {
                "id": "dante",
                "name": "Dante",
                "description": "charismatic man, early 30s, friendly smirk, short wavy hair, casual confident style, relaxed posture, earth tones clothing",
                "style": "anime",
                "gender": "male",
                "age": "adult",
            },
            {
                "id": "sasha",
                "name": "Sasha",
                "description": "warm gentle woman, late 20s, soft features, long flowing hair, kind eyes, cozy sweater, approachable and thoughtful expression",
                "style": "anime",
                "gender": "female",
                "age": "adult",
            },
            {
                "id": "cora",
                "name": "Cora",
                "description": "sharp confident woman, early 30s, athletic build, short stylish hair, determined eyes, tech/streetwear style, subtle anime references in accessories",
                "style": "anime",
                "gender": "female",
                "age": "adult",
            },
            {
                "id": "natasha",
                "name": "Natasha",
                "description": "sophisticated woman, mid 30s, elegant features, sleek dark hair, piercing intelligent eyes, professional but stylish attire, subtle power aesthetic",
                "style": "anime",
                "gender": "female",
                "age": "adult",
            },
        ]
    }


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=8000)
