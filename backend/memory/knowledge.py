"""
Knowledge Base - Markdown files with hash-based tracking.

Inspired by local-deepwiki's approach to maintaining documentation.
Stores structured facts, conversation summaries, and personal information.
"""

import hashlib
import json
import os
from dataclasses import dataclass, field, asdict
from datetime import datetime
from pathlib import Path
from typing import Optional


@dataclass
class Fact:
    """A single memorable fact."""
    content: str
    category: str  # personal, preference, project, person, skill
    source: str  # conversation_id or "manual"
    created_at: str = field(default_factory=lambda: datetime.now().isoformat())
    confidence: float = 1.0


@dataclass
class KnowledgePage:
    """A page in the knowledge base (like deepwiki)."""
    id: str
    title: str
    file: str
    category: str
    facts: list[Fact] = field(default_factory=list)
    content_hash: str = ""
    last_updated: str = field(default_factory=lambda: datetime.now().isoformat())


@dataclass
class KnowledgeIndex:
    """Index of all knowledge pages (like wiki.json)."""
    name: str = "avatar-ai-memory"
    version: str = "1.0.0"
    pages: list[KnowledgePage] = field(default_factory=list)
    total_facts: int = 0
    last_updated: str = field(default_factory=lambda: datetime.now().isoformat())


class KnowledgeBase:
    """
    Manages the .memory/ knowledge base.

    Structure:
    .memory/
    ├── memory.json          # Index with hashes
    ├── personal.md          # Personal facts
    ├── preferences.md       # User preferences
    ├── projects.md          # Projects mentioned
    ├── people.md            # People mentioned
    ├── skills.md            # Skills and tools
    └── conversations/       # Summarized conversations
        ├── 2026-08-13.md
        └── ...
    """

    CATEGORIES = ["personal", "preferences", "projects", "people", "skills"]

    def __init__(self, base_path: str = ".memory"):
        self.base_path = Path(base_path)
        self.index_path = self.base_path / "memory.json"
        self.conversations_path = self.base_path / "conversations"
        self.index: KnowledgeIndex | None = None
        self._ensure_structure()

    def _ensure_structure(self) -> None:
        """Create the .memory directory structure if needed."""
        self.base_path.mkdir(parents=True, exist_ok=True)
        self.conversations_path.mkdir(exist_ok=True)

        # Create category files if they don't exist
        for category in self.CATEGORIES:
            path = self.base_path / f"{category}.md"
            if not path.exists():
                path.write_text(f"# {category.title()}\n\n_No facts recorded yet._\n")

        # Load or create index
        if self.index_path.exists():
            self.index = self._load_index()
        else:
            self.index = KnowledgeIndex()
            self._init_pages()
            self._save_index()

    def _init_pages(self) -> None:
        """Initialize pages for each category."""
        for category in self.CATEGORIES:
            page = KnowledgePage(
                id=category,
                title=category.title(),
                file=f"{category}.md",
                category=category,
            )
            self.index.pages.append(page)

    def _load_index(self) -> KnowledgeIndex:
        """Load the index from memory.json."""
        data = json.loads(self.index_path.read_text())
        pages = [
            KnowledgePage(
                id=p["id"],
                title=p["title"],
                file=p["file"],
                category=p["category"],
                facts=[Fact(**f) for f in p.get("facts", [])],
                content_hash=p.get("content_hash", ""),
                last_updated=p.get("last_updated", ""),
            )
            for p in data.get("pages", [])
        ]
        return KnowledgeIndex(
            name=data.get("name", "avatar-ai-memory"),
            version=data.get("version", "1.0.0"),
            pages=pages,
            total_facts=data.get("total_facts", 0),
            last_updated=data.get("last_updated", ""),
        )

    def _save_index(self) -> None:
        """Save the index to memory.json."""
        self.index.total_facts = sum(len(p.facts) for p in self.index.pages)
        self.index.last_updated = datetime.now().isoformat()

        data = {
            "name": self.index.name,
            "version": self.index.version,
            "pages": [
                {
                    "id": p.id,
                    "title": p.title,
                    "file": p.file,
                    "category": p.category,
                    "facts": [asdict(f) for f in p.facts],
                    "content_hash": p.content_hash,
                    "last_updated": p.last_updated,
                }
                for p in self.index.pages
            ],
            "total_facts": self.index.total_facts,
            "last_updated": self.index.last_updated,
        }
        self.index_path.write_text(json.dumps(data, indent=2))

    def _compute_hash(self, content: str) -> str:
        """Compute content hash for staleness detection."""
        return hashlib.sha256(content.encode()).hexdigest()[:16]

    def _get_page(self, category: str) -> KnowledgePage | None:
        """Get a page by category."""
        for page in self.index.pages:
            if page.category == category:
                return page
        return None

    def _render_page(self, page: KnowledgePage) -> str:
        """Render a page to markdown."""
        lines = [f"# {page.title}", ""]

        if not page.facts:
            lines.append("_No facts recorded yet._")
        else:
            for fact in page.facts:
                confidence_str = f" ({int(fact.confidence * 100)}%)" if fact.confidence < 1.0 else ""
                lines.append(f"- {fact.content}{confidence_str}")

        lines.append("")
        lines.append(f"_Last updated: {page.last_updated}_")
        return "\n".join(lines)

    def add_fact(
        self,
        content: str,
        category: str,
        source: str = "manual",
        confidence: float = 1.0,
    ) -> Fact:
        """Add a fact to the knowledge base."""
        if category not in self.CATEGORIES:
            raise ValueError(f"Invalid category: {category}. Must be one of {self.CATEGORIES}")

        page = self._get_page(category)
        if not page:
            raise ValueError(f"Page not found for category: {category}")

        # Check for duplicates
        for existing in page.facts:
            if existing.content.lower() == content.lower():
                # Update confidence if higher
                if confidence > existing.confidence:
                    existing.confidence = confidence
                return existing

        fact = Fact(
            content=content,
            category=category,
            source=source,
            confidence=confidence,
        )
        page.facts.append(fact)
        page.last_updated = datetime.now().isoformat()

        # Update markdown file
        md_content = self._render_page(page)
        (self.base_path / page.file).write_text(md_content)
        page.content_hash = self._compute_hash(md_content)

        self._save_index()
        return fact

    def add_facts_batch(
        self,
        facts: list[dict],
        source: str = "extraction",
    ) -> list[Fact]:
        """Add multiple facts at once."""
        added = []
        for f in facts:
            try:
                fact = self.add_fact(
                    content=f["content"],
                    category=f.get("category", "personal"),
                    source=source,
                    confidence=f.get("confidence", 0.9),
                )
                added.append(fact)
            except (ValueError, KeyError):
                continue
        return added

    def get_all_facts(self) -> list[Fact]:
        """Get all facts across all categories."""
        facts = []
        for page in self.index.pages:
            facts.extend(page.facts)
        return facts

    def get_facts_by_category(self, category: str) -> list[Fact]:
        """Get facts for a specific category."""
        page = self._get_page(category)
        return page.facts if page else []

    def search_facts(self, query: str) -> list[Fact]:
        """Simple text search across all facts."""
        query_lower = query.lower()
        results = []
        for fact in self.get_all_facts():
            if query_lower in fact.content.lower():
                results.append(fact)
        return results

    def save_conversation_summary(
        self,
        summary: str,
        date: str | None = None,
    ) -> Path:
        """Save a conversation summary."""
        date_str = date or datetime.now().strftime("%Y-%m-%d")
        path = self.conversations_path / f"{date_str}.md"

        # Append if file exists
        if path.exists():
            existing = path.read_text()
            content = existing + f"\n\n---\n\n{summary}"
        else:
            content = f"# Conversations - {date_str}\n\n{summary}"

        path.write_text(content)
        return path

    def check_staleness(self) -> list[dict]:
        """Check for stale pages (like deepwiki status)."""
        stale = []
        for page in self.index.pages:
            file_path = self.base_path / page.file
            if file_path.exists():
                current_content = file_path.read_text()
                current_hash = self._compute_hash(current_content)
                if current_hash != page.content_hash:
                    stale.append({
                        "page": page.id,
                        "expected_hash": page.content_hash,
                        "actual_hash": current_hash,
                    })
        return stale

    def get_context_string(self, max_facts: int = 20) -> str:
        """Get facts formatted for LLM context injection."""
        facts = self.get_all_facts()[:max_facts]
        if not facts:
            return ""

        lines = ["## Known Facts About User"]
        for fact in facts:
            lines.append(f"- [{fact.category}] {fact.content}")
        return "\n".join(lines)
