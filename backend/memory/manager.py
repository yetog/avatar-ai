"""
Memory Manager - Orchestrates all memory systems.

Provides a unified interface for:
- Session memory (current conversation)
- Long-term memory (vector search)
- Knowledge base (structured facts)
"""

from typing import Optional
from dataclasses import dataclass

from .session import SessionMemory, Session
from .longterm import LongTermMemory
from .knowledge import KnowledgeBase, Fact
from ..providers.base import LLMProvider, Message, MemoryContext


@dataclass
class MemoryConfig:
    """Configuration for the memory system."""
    session_window: int = 20
    extraction_interval: int = 10  # Extract facts every N messages
    memory_base_path: str = ".memory"
    max_context_facts: int = 15
    max_context_memories: int = 3


class MemoryManager:
    """
    Unified memory management for Avatar AI.

    Coordinates between session, long-term, and knowledge base storage.
    """

    def __init__(
        self,
        config: MemoryConfig | None = None,
        llm_provider: LLMProvider | None = None,
    ):
        self.config = config or MemoryConfig()
        self.llm = llm_provider

        # Initialize memory systems
        self.session = SessionMemory(window_size=self.config.session_window)
        self.longterm = LongTermMemory(
            persist_path=f"{self.config.memory_base_path}/embeddings"
        )
        self.knowledge = KnowledgeBase(base_path=self.config.memory_base_path)

        # Track messages since last extraction
        self._messages_since_extraction: dict[str, int] = {}

    def set_llm_provider(self, provider: LLMProvider) -> None:
        """Set the LLM provider for fact extraction."""
        self.llm = provider

    # --- Session Management ---

    def start_session(self, metadata: dict | None = None) -> Session:
        """Start a new conversation session."""
        session = self.session.create_session(metadata)
        self._messages_since_extraction[session.id] = 0
        return session

    def add_message(
        self,
        role: str,
        content: str,
        session_id: str | None = None,
    ) -> None:
        """Add a message and trigger extraction if needed."""
        self.session.add_message(role, content, session_id)

        # Track for extraction
        sid = session_id or self.session.active_session_id
        if sid:
            self._messages_since_extraction[sid] = (
                self._messages_since_extraction.get(sid, 0) + 1
            )

    async def maybe_extract_facts(self, session_id: str | None = None) -> list[Fact]:
        """Extract facts if enough messages have accumulated."""
        sid = session_id or self.session.active_session_id
        if not sid or not self.llm:
            return []

        count = self._messages_since_extraction.get(sid, 0)
        if count < self.config.extraction_interval:
            return []

        # Get recent messages for extraction
        messages = self.session.get_context_window(sid)
        if not messages:
            return []

        # Convert to provider format
        provider_messages = [
            Message(role=m.role, content=m.content) for m in messages
        ]

        # Extract facts using LLM
        extracted = await self.llm.extract_facts(provider_messages)

        # Categorize and store facts
        added_facts = []
        for fact_text in extracted:
            category = self._categorize_fact(fact_text)
            fact = self.knowledge.add_fact(
                content=fact_text,
                category=category,
                source=sid,
                confidence=0.85,
            )
            added_facts.append(fact)

            # Also add to vector store
            self.longterm.add_fact(
                fact=fact_text,
                category=category,
                source=sid,
            )

        # Reset counter
        self._messages_since_extraction[sid] = 0

        return added_facts

    def _categorize_fact(self, fact: str) -> str:
        """Simple heuristic categorization of facts."""
        fact_lower = fact.lower()

        if any(w in fact_lower for w in ["name is", "i am", "my age", "i live", "born"]):
            return "personal"
        if any(w in fact_lower for w in ["prefer", "like", "favorite", "enjoy", "hate"]):
            return "preferences"
        if any(w in fact_lower for w in ["working on", "project", "building", "developing"]):
            return "projects"
        if any(w in fact_lower for w in ["use", "know", "experience", "skill", "tool"]):
            return "skills"
        if any(w in fact_lower for w in ["friend", "colleague", "family", "met", "person"]):
            return "people"

        return "personal"  # Default

    async def end_session(self, session_id: str | None = None) -> None:
        """End a session, summarize, and archive."""
        sid = session_id or self.session.active_session_id
        if not sid:
            return

        session = self.session.get_session(sid)
        if not session or not session.messages:
            self.session.end_session(sid)
            return

        # Generate summary if we have an LLM
        if self.llm:
            conversation_text = self.session.export_for_summary(sid)
            summary = await self._summarize_conversation(conversation_text)

            # Store summary
            self.knowledge.save_conversation_summary(summary)
            self.longterm.add_conversation_summary(
                summary=summary,
                session_id=sid,
                message_count=len(session.messages),
            )

            # Final fact extraction
            await self.maybe_extract_facts(sid)

        # Clean up
        self.session.end_session(sid)
        self._messages_since_extraction.pop(sid, None)

    async def _summarize_conversation(self, conversation: str) -> str:
        """Generate a summary of the conversation."""
        if not self.llm:
            return conversation[:500] + "..."

        prompt = """Summarize this conversation in 2-3 sentences, focusing on:
- Key topics discussed
- Any decisions made
- Important information shared

Conversation:
""" + conversation

        summary = await self.llm.chat(
            messages=[Message(role="user", content=prompt)],
            system_prompt="You are a concise summarizer. Be brief but capture key points.",
        )
        return summary

    # --- Context Retrieval ---

    def get_context_for_query(self, query: str) -> MemoryContext:
        """Get relevant memory context for an LLM query."""
        # Get facts from knowledge base
        all_facts = self.knowledge.get_all_facts()
        fact_strings = [f.content for f in all_facts[: self.config.max_context_facts]]

        # Get relevant memories via vector search
        relevant = self.longterm.get_relevant_context(
            query=query,
            max_conversations=self.config.max_context_memories,
            max_facts=5,
        )

        # Combine vector-retrieved facts with knowledge base facts
        all_relevant_facts = list(set(fact_strings + relevant["facts"]))

        # Get recent conversation summary if available
        recent_summary = None
        if relevant["conversations"]:
            recent_summary = relevant["conversations"][0]

        return MemoryContext(
            facts=all_relevant_facts[:20],
            recent_summary=recent_summary,
            relevant_memories=relevant["conversations"][1:] if len(relevant["conversations"]) > 1 else None,
        )

    def get_session_messages(self, session_id: str | None = None) -> list[Message]:
        """Get session messages in provider format."""
        messages = self.session.get_context_window(session_id)
        return [Message(role=m.role, content=m.content) for m in messages]

    # --- Stats & Management ---

    def get_stats(self) -> dict:
        """Get memory system statistics."""
        return {
            "session": {
                "active_sessions": len(self.session.sessions),
                "current_session_messages": len(
                    self.session.get_full_conversation() or []
                ),
            },
            "longterm": self.longterm.get_stats(),
            "knowledge": {
                "total_facts": self.knowledge.index.total_facts,
                "categories": {
                    cat: len(self.knowledge.get_facts_by_category(cat))
                    for cat in self.knowledge.CATEGORIES
                },
                "stale_pages": len(self.knowledge.check_staleness()),
            },
        }

    def add_manual_fact(
        self,
        content: str,
        category: str,
    ) -> Fact:
        """Manually add a fact to the knowledge base."""
        fact = self.knowledge.add_fact(
            content=content,
            category=category,
            source="manual",
            confidence=1.0,
        )
        self.longterm.add_fact(
            fact=content,
            category=category,
            source="manual",
        )
        return fact

    def search_memories(self, query: str, n_results: int = 10) -> list[dict]:
        """Search all memories."""
        return self.longterm.search(query, n_results)
