"""
Long-Term Memory - ChromaDB vector storage.

Stores embeddings of conversations and facts for semantic search.
"""

import chromadb
from chromadb.config import Settings
from datetime import datetime
from pathlib import Path
from typing import Optional
import uuid


class LongTermMemory:
    """
    Vector-based long-term memory using ChromaDB.

    Enables semantic search across:
    - Past conversation summaries
    - Extracted facts
    - Knowledge base entries
    """

    def __init__(
        self,
        persist_path: str = ".memory/embeddings",
        collection_name: str = "avatar_memories",
    ):
        self.persist_path = Path(persist_path)
        self.persist_path.mkdir(parents=True, exist_ok=True)

        # Initialize ChromaDB with persistence
        self.client = chromadb.PersistentClient(
            path=str(self.persist_path),
            settings=Settings(anonymized_telemetry=False),
        )

        # Get or create collection
        self.collection = self.client.get_or_create_collection(
            name=collection_name,
            metadata={"description": "Avatar AI long-term memories"},
        )

    def add_memory(
        self,
        content: str,
        memory_type: str,  # "conversation", "fact", "knowledge"
        metadata: dict | None = None,
    ) -> str:
        """Add a memory to the vector store."""
        memory_id = str(uuid.uuid4())

        meta = {
            "type": memory_type,
            "created_at": datetime.now().isoformat(),
            **(metadata or {}),
        }

        self.collection.add(
            ids=[memory_id],
            documents=[content],
            metadatas=[meta],
        )

        return memory_id

    def add_conversation_summary(
        self,
        summary: str,
        session_id: str,
        message_count: int = 0,
    ) -> str:
        """Add a conversation summary."""
        return self.add_memory(
            content=summary,
            memory_type="conversation",
            metadata={
                "session_id": session_id,
                "message_count": message_count,
            },
        )

    def add_fact(
        self,
        fact: str,
        category: str,
        source: str,
    ) -> str:
        """Add a fact to vector storage."""
        return self.add_memory(
            content=fact,
            memory_type="fact",
            metadata={
                "category": category,
                "source": source,
            },
        )

    def search(
        self,
        query: str,
        n_results: int = 5,
        memory_type: str | None = None,
    ) -> list[dict]:
        """Semantic search for relevant memories."""
        where_filter = {"type": memory_type} if memory_type else None

        results = self.collection.query(
            query_texts=[query],
            n_results=n_results,
            where=where_filter,
        )

        memories = []
        if results["documents"] and results["documents"][0]:
            for i, doc in enumerate(results["documents"][0]):
                memories.append({
                    "id": results["ids"][0][i],
                    "content": doc,
                    "metadata": results["metadatas"][0][i] if results["metadatas"] else {},
                    "distance": results["distances"][0][i] if results["distances"] else None,
                })

        return memories

    def search_conversations(self, query: str, n_results: int = 3) -> list[dict]:
        """Search past conversation summaries."""
        return self.search(query, n_results, memory_type="conversation")

    def search_facts(self, query: str, n_results: int = 5) -> list[dict]:
        """Search stored facts."""
        return self.search(query, n_results, memory_type="fact")

    def get_relevant_context(
        self,
        query: str,
        max_conversations: int = 2,
        max_facts: int = 5,
    ) -> dict:
        """Get relevant context for a query (conversations + facts)."""
        conversations = self.search_conversations(query, max_conversations)
        facts = self.search_facts(query, max_facts)

        return {
            "conversations": [c["content"] for c in conversations],
            "facts": [f["content"] for f in facts],
        }

    def get_stats(self) -> dict:
        """Get memory statistics."""
        count = self.collection.count()

        # Count by type
        type_counts = {}
        for memory_type in ["conversation", "fact", "knowledge"]:
            try:
                results = self.collection.get(
                    where={"type": memory_type},
                    limit=10000,
                )
                type_counts[memory_type] = len(results["ids"]) if results["ids"] else 0
            except Exception:
                type_counts[memory_type] = 0

        return {
            "total_memories": count,
            "by_type": type_counts,
        }

    def delete_memory(self, memory_id: str) -> bool:
        """Delete a specific memory."""
        try:
            self.collection.delete(ids=[memory_id])
            return True
        except Exception:
            return False

    def clear_all(self) -> None:
        """Clear all memories (use with caution)."""
        self.client.delete_collection(self.collection.name)
        self.collection = self.client.create_collection(
            name=self.collection.name,
            metadata={"description": "Avatar AI long-term memories"},
        )
