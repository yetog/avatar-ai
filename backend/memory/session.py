"""
Session Memory - In-memory conversation context.

Maintains a sliding window of recent messages for immediate context.
"""

from dataclasses import dataclass, field
from datetime import datetime
from typing import Optional
import uuid


@dataclass
class ConversationMessage:
    role: str  # "user" or "assistant"
    content: str
    timestamp: datetime = field(default_factory=datetime.now)
    audio_duration: Optional[float] = None  # For voice messages


@dataclass
class Session:
    id: str = field(default_factory=lambda: str(uuid.uuid4()))
    started_at: datetime = field(default_factory=datetime.now)
    messages: list[ConversationMessage] = field(default_factory=list)
    metadata: dict = field(default_factory=dict)


class SessionMemory:
    """Manages in-memory session state."""

    def __init__(self, window_size: int = 20):
        self.window_size = window_size
        self.sessions: dict[str, Session] = {}
        self.active_session_id: Optional[str] = None

    def create_session(self, metadata: dict | None = None) -> Session:
        """Create a new conversation session."""
        session = Session(metadata=metadata or {})
        self.sessions[session.id] = session
        self.active_session_id = session.id
        return session

    def get_session(self, session_id: str | None = None) -> Session | None:
        """Get a session by ID or the active session."""
        sid = session_id or self.active_session_id
        return self.sessions.get(sid) if sid else None

    def add_message(
        self,
        role: str,
        content: str,
        session_id: str | None = None,
        audio_duration: float | None = None,
    ) -> ConversationMessage:
        """Add a message to the session."""
        session = self.get_session(session_id)
        if not session:
            session = self.create_session()

        msg = ConversationMessage(
            role=role,
            content=content,
            audio_duration=audio_duration,
        )
        session.messages.append(msg)
        return msg

    def get_context_window(self, session_id: str | None = None) -> list[ConversationMessage]:
        """Get the most recent messages within the window size."""
        session = self.get_session(session_id)
        if not session:
            return []
        return session.messages[-self.window_size:]

    def get_full_conversation(self, session_id: str | None = None) -> list[ConversationMessage]:
        """Get all messages in the session."""
        session = self.get_session(session_id)
        return session.messages if session else []

    def clear_session(self, session_id: str | None = None) -> None:
        """Clear a session's messages."""
        session = self.get_session(session_id)
        if session:
            session.messages.clear()

    def end_session(self, session_id: str | None = None) -> Session | None:
        """End and remove a session, returning it for archival."""
        sid = session_id or self.active_session_id
        if sid:
            session = self.sessions.pop(sid, None)
            if sid == self.active_session_id:
                self.active_session_id = None
            return session
        return None

    def export_for_summary(self, session_id: str | None = None) -> str:
        """Export conversation as text for summarization."""
        messages = self.get_full_conversation(session_id)
        return "\n".join(
            f"{msg.role.upper()}: {msg.content}"
            for msg in messages
        )
