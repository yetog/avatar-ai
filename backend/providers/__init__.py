"""
Avatar AI - Provider Abstraction Layer

Swap LLM, TTS, and STT providers without code changes.
"""

from .base import LLMProvider, TTSProvider, STTProvider
from .ollama import OllamaLLM
from .elevenlabs import ElevenLabsTTS
from .claude import ClaudeLLM

__all__ = [
    "LLMProvider",
    "TTSProvider",
    "STTProvider",
    "OllamaLLM",
    "ElevenLabsTTS",
    "ClaudeLLM",
]
