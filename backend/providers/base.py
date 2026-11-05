"""
Base provider interfaces for LLM, TTS, and STT.
"""

from abc import ABC, abstractmethod
from dataclasses import dataclass
from typing import AsyncIterator


@dataclass
class Message:
    role: str  # "user", "assistant", "system"
    content: str


@dataclass
class MemoryContext:
    """Context retrieved from memory system."""
    facts: list[str]
    recent_summary: str | None = None
    relevant_memories: list[str] | None = None


class LLMProvider(ABC):
    """Abstract base class for LLM providers."""

    @abstractmethod
    async def chat(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        memory_context: MemoryContext | None = None,
    ) -> str:
        """Generate a response from the LLM."""
        pass

    @abstractmethod
    async def chat_stream(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        memory_context: MemoryContext | None = None,
    ) -> AsyncIterator[str]:
        """Stream response tokens from the LLM."""
        pass

    @abstractmethod
    async def extract_facts(self, conversation: list[Message]) -> list[str]:
        """Extract memorable facts from a conversation."""
        pass


class TTSProvider(ABC):
    """Abstract base class for Text-to-Speech providers."""

    @abstractmethod
    async def synthesize(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> bytes:
        """Convert text to speech audio (WAV/MP3 bytes)."""
        pass

    @abstractmethod
    async def synthesize_stream(
        self,
        text: str,
        voice_id: str | None = None,
    ) -> AsyncIterator[bytes]:
        """Stream audio chunks for low-latency playback."""
        pass

    @abstractmethod
    async def list_voices(self) -> list[dict]:
        """List available voices."""
        pass


class STTProvider(ABC):
    """Abstract base class for Speech-to-Text providers."""

    @abstractmethod
    async def transcribe(self, audio: bytes, language: str = "en") -> str:
        """Transcribe audio to text."""
        pass

    @abstractmethod
    async def transcribe_stream(
        self,
        audio_stream: AsyncIterator[bytes],
    ) -> AsyncIterator[str]:
        """Real-time transcription from audio stream."""
        pass
