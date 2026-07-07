# Lessons Summary

## Lesson 1 — Foundations: Environment, Models, and Your First Agent
Set up a TypeScript project from scratch (Node + `tsx`, ES modules), configure API keys safely via `.env`, and use LangChain's `initChatModel` to create standardized chat models with different temperature settings. Build and run your very first agent with `createAgent` — a model plus a system prompt, no tools yet — and learn how to invoke it and read the returned message list.

## Lesson 2 — Tools & Prompt Engineering: The Research Agent
Learn how tools work in LangChain: wiring up a pre-built tool (Tavily web search) and writing a custom tool with `tool()` and a Zod schema (where every `.describe()` doubles as documentation for the model). Apply structured prompt engineering — role, task, output contract, constraints — to build a research agent that searches the web and saves its findings to `output/research.md`.

## Lesson 3 — Multi-Agent Patterns: Supervisor & Sub-Agents
Understand why and when to split one agent into many (focus, context management, independence). Learn the **sub-agents-as-tools (supervisor)** pattern: wrap each specialist agent in a `tool()` so a supervisor agent can call it like any other tool. Build a technical writer agent and a fact-checker agent, then orchestrate a 3-agent pipeline (research → write → fact-check) that passes work between agents via markdown files.

## Lesson 4 — Images, Skills & the Full Studio
Wrap an external API (OpenAI's image generation model) as a custom tool, and build an image agent that turns an article into a cover image. Learn a second multi-agent pattern — **skills** — where a single social media agent loads platform-specific expertise on demand via a `load_skill` tool (progressive disclosure) instead of spawning a new agent per platform. Finally, wire all five agents (research, writer, fact-checker, image, social) into the supervisor and run the complete content studio end to end, producing a full content package from a single command.
