"""
Avatar AI - Memory System

Three-tier memory architecture:
1. Session memory (in-memory, current conversation)
2. Long-term memory (ChromaDB vectors)
3. Knowledge base (Markdown files with hash tracking)
"""

from .session import SessionMemory
from .longterm import LongTermMemory
from .knowledge import KnowledgeBase
from .manager import MemoryManager

__all__ = [
    "SessionMemory",
    "LongTermMemory",
    "KnowledgeBase",
    "MemoryManager",
]
