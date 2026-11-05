"""
Claude LLM Provider - Anthropic API fallback.
"""

import httpx
import os
import json
from typing import AsyncIterator

from .base import LLMProvider, Message, MemoryContext


class ClaudeLLM(LLMProvider):
    """Claude provider for Anthropic API."""

    def __init__(
        self,
        api_key: str | None = None,
        model: str = "claude-sonnet-4-20250514",
    ):
        self.api_key = api_key or os.getenv("ANTHROPIC_API_KEY")
        self.model = model
        self.base_url = "https://api.anthropic.com/v1"
        self.client = httpx.AsyncClient(
            timeout=120.0,
            headers={
                "x-api-key": self.api_key,
                "anthropic-version": "2023-06-01",
                "content-type": "application/json",
            },
        )

    def _build_system_prompt(
        self,
        system_prompt: str | None,
        memory_context: MemoryContext | None,
    ) -> str:
        """Build system prompt with memory context."""
        parts = []

        if system_prompt:
            parts.append(system_prompt)

        if memory_context:
            if memory_context.facts:
                facts_str = "\n".join(f"- {f}" for f in memory_context.facts)
                parts.append(f"\n## Known Facts About User\n{facts_str}")

            if memory_context.recent_summary:
                parts.append(
                    f"\n## Recent Conversation Summary\n{memory_context.recent_summary}"
                )

            if memory_context.relevant_memories:
                memories_str = "\n".join(
                    f"- {m}" for m in memory_context.relevant_memories
                )
                parts.append(f"\n## Relevant Memories\n{memories_str}")

        return "\n".join(parts) if parts else ""

    async def chat(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        memory_context: MemoryContext | None = None,
    ) -> str:
        """Generate a response from Claude."""
        system = self._build_system_prompt(system_prompt, memory_context)

        api_messages = [{"role": m.role, "content": m.content} for m in messages]

        payload = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": api_messages,
        }
        if system:
            payload["system"] = system

        response = await self.client.post(
            f"{self.base_url}/messages",
            json=payload,
        )
        response.raise_for_status()
        data = response.json()
        return data["content"][0]["text"]

    async def chat_stream(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        memory_context: MemoryContext | None = None,
    ) -> AsyncIterator[str]:
        """Stream response tokens from Claude."""
        system = self._build_system_prompt(system_prompt, memory_context)

        api_messages = [{"role": m.role, "content": m.content} for m in messages]

        payload = {
            "model": self.model,
            "max_tokens": 4096,
            "messages": api_messages,
            "stream": True,
        }
        if system:
            payload["system"] = system

        async with self.client.stream(
            "POST",
            f"{self.base_url}/messages",
            json=payload,
        ) as response:
            async for line in response.aiter_lines():
                if line.startswith("data: "):
                    data = json.loads(line[6:])
                    if data["type"] == "content_block_delta":
                        yield data["delta"].get("text", "")

    async def extract_facts(self, conversation: list[Message]) -> list[str]:
        """Extract memorable facts from a conversation."""
        extraction_prompt = """Analyze this conversation and extract key facts about the user.

Return a JSON array of strings. Focus on:
- Personal information
- Projects they're working on
- People they mention
- Goals and interests

Only include explicitly stated facts. Be concise.

Conversation:
"""
        conv_text = "\n".join(f"{m.role}: {m.content}" for m in conversation)

        response = await self.chat(
            messages=[Message(role="user", content=extraction_prompt + conv_text)],
            system_prompt="Return only valid JSON array of strings.",
        )

        try:
            clean = response.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(clean)
        except json.JSONDecodeError:
            return []

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
