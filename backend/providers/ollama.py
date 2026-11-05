"""
Ollama LLM Provider - Local model inference.
"""

import httpx
from typing import AsyncIterator
import json

from .base import LLMProvider, Message, MemoryContext


class OllamaLLM(LLMProvider):
    """Ollama provider for local LLM inference."""

    def __init__(
        self,
        model: str = "llama3.1:8b",
        base_url: str = "http://localhost:11434",
    ):
        self.model = model
        self.base_url = base_url
        self.client = httpx.AsyncClient(timeout=120.0)

    def _build_prompt(
        self,
        messages: list[Message],
        system_prompt: str | None,
        memory_context: MemoryContext | None,
    ) -> list[dict]:
        """Build the message list with memory context injected."""
        result = []

        # Build system prompt with memory context
        system_parts = []
        if system_prompt:
            system_parts.append(system_prompt)

        if memory_context:
            if memory_context.facts:
                facts_str = "\n".join(f"- {f}" for f in memory_context.facts)
                system_parts.append(f"\n## Known Facts About User\n{facts_str}")

            if memory_context.recent_summary:
                system_parts.append(
                    f"\n## Recent Conversation Summary\n{memory_context.recent_summary}"
                )

            if memory_context.relevant_memories:
                memories_str = "\n".join(
                    f"- {m}" for m in memory_context.relevant_memories
                )
                system_parts.append(f"\n## Relevant Memories\n{memories_str}")

        if system_parts:
            result.append({"role": "system", "content": "\n".join(system_parts)})

        # Add conversation messages
        for msg in messages:
            result.append({"role": msg.role, "content": msg.content})

        return result

    async def chat(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        memory_context: MemoryContext | None = None,
    ) -> str:
        """Generate a response from Ollama."""
        prompt_messages = self._build_prompt(messages, system_prompt, memory_context)

        response = await self.client.post(
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": prompt_messages,
                "stream": False,
            },
        )
        response.raise_for_status()
        data = response.json()
        return data["message"]["content"]

    async def chat_stream(
        self,
        messages: list[Message],
        system_prompt: str | None = None,
        memory_context: MemoryContext | None = None,
    ) -> AsyncIterator[str]:
        """Stream response tokens from Ollama."""
        prompt_messages = self._build_prompt(messages, system_prompt, memory_context)

        async with self.client.stream(
            "POST",
            f"{self.base_url}/api/chat",
            json={
                "model": self.model,
                "messages": prompt_messages,
                "stream": True,
            },
        ) as response:
            async for line in response.aiter_lines():
                if line:
                    data = json.loads(line)
                    if "message" in data and "content" in data["message"]:
                        yield data["message"]["content"]

    async def extract_facts(self, conversation: list[Message]) -> list[str]:
        """Extract memorable facts from a conversation."""
        extraction_prompt = """Analyze this conversation and extract key facts about the user that should be remembered for future conversations.

Return a JSON array of strings, each being a discrete fact. Focus on:
- Personal information (name, preferences, location)
- Projects they're working on
- People they mention
- Goals and interests
- Technical skills or tools they use

Only include facts explicitly stated or clearly implied. Be concise.

Example output: ["User's name is Alex", "Working on a fitness app", "Prefers Python over JavaScript"]

Conversation:
"""
        conv_text = "\n".join(f"{m.role}: {m.content}" for m in conversation)

        response = await self.chat(
            messages=[Message(role="user", content=extraction_prompt + conv_text)],
            system_prompt="You are a fact extraction assistant. Return only valid JSON.",
        )

        try:
            # Try to parse JSON from response
            # Handle cases where response might have markdown code blocks
            clean = response.strip()
            if clean.startswith("```"):
                clean = clean.split("\n", 1)[1].rsplit("```", 1)[0]
            return json.loads(clean)
        except json.JSONDecodeError:
            return []

    async def close(self):
        """Close the HTTP client."""
        await self.client.aclose()
