"""
ElevenLabs TTS Provider - High-quality text-to-speech.
"""

import httpx
import os
from typing import AsyncIterator

from .base import TTSProvider


class ElevenLabsTTS(TTSProvider):
    """ElevenLabs provider for high-quality TTS."""

    def __init__(
        self,
        api_key: str | None = None,
        default_voice_id: str = "pNInz6obpgDQGcFmaJgB",  # Adam
        model_id: str = "eleven_turbo_v2_5",
    ):
        self.api_key = api_key or os.getenv("ELEVENLABS_API_KEY")
        self.default_voice_id = default_voice_id
        self.model_id = model_id
        self.base_url = "https://api.elevenlabs.io/v1"
        self.client = httpx.AsyncClient(
            timeout=60.0,
            headers={"xi-api-key": self.api_key},
        )

    async def synthesize(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> bytes:
        """Convert text to speech audio."""
        voice = voice_id or self.default_voice_id

        response = await self.client.post(
            f"{self.base_url}/text-to-speech/{voice}",
            json={
                "text": text,
                "model_id": self.model_id,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        )
        response.raise_for_status()
        return response.content

    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        """Stream audio chunks for low-latency playback."""
        voice = voice_id or self.default_voice_id

        async with self.client.stream(
            "POST",
            f"{self.base_url}/text-to-speech/{voice}/stream",
            json={
                "text": text,
                "model_id": self.model_id,
                "voice_settings": {
                    "stability": 0.5,
                    "similarity_boost": 0.75,
                },
            },
        ) as response:
            async for chunk in response.aiter_bytes(chunk_size=1024):
                yield chunk

    async def list_voices(self) -> list[dict]:
        """List available voices."""
        response = await self.client.get(f"{self.base_url}/voices")
        response.raise_for_status()
        data = response.json()
        return [
            {
                "voice_id": v["voice_id"],
                "name": v["name"],
                "category": v.get("category", "unknown"),
                "labels": v.get("labels", {}),
            }
            for v in data.get("voices", [])
        ]

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
