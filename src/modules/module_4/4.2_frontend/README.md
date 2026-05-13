# 4.2 Frontend Integration Demo

A minimal full-stack chat demo using `useStream` from `@langchain/react` to connect a React frontend to a LangChain agent backend.

## Architecture

```
React App (Vite, port 5173)          Express Backend (port 2024)
┌────────────────────────┐           ┌────────────────────────────┐
│  useStream hook        │  SSE ──►  │  POST /threads/:id/        │
│  @langchain/react      │ ◄── HTTP  │       runs/stream          │
│                        │           │                            │
│  Sends messages via    │           │  createAgent (langchain)   │
│  submit()              │           │  streamEvents → tokens     │
└────────────────────────┘           └────────────────────────────┘
```

`useStream` expects a **LangGraph Server-compatible REST API**. The Express server in `server.ts` implements the four minimal endpoints needed:

| Endpoint | Purpose |
|----------|---------|
| `GET /assistants/search` | Validates the `assistantId: "agent"` |
| `POST /threads` | Creates a conversation thread (UUID, in-memory) |
| `GET /threads/:id/state` | Returns empty state (stateless demo) |
| `POST /threads/:id/runs/stream` | Streams agent response as SSE |

The SSE format used is the LangGraph `messages/partial` protocol — each event carries the **full accumulated text** so `useStream` can replace the in-progress message as tokens arrive.

## Prerequisites

- Node.js 20+
- An `OPENAI_API_KEY` set in the project root `.env` file (two levels up: `../../../../../../.env`, or export it in your shell)

## Setup

Install dependencies for this sub-project (separate from the root project):

```bash
cd src/modules/module_4/4.2_frontend
npm install
```

## Running

You need **two terminals**:

**Terminal 1 — Backend (LangChain agent server):**
```bash
npx tsx server.ts
# → Chat server running on http://localhost:2024
```

**Terminal 2 — Frontend (React dev server):**
```bash
npx vite
# → Local: http://localhost:5173
```

Then open **http://localhost:5173** in your browser.

## Troubleshooting

**Vite module errors (e.g. `does not provide an export named 'default'`):**
Clear Vite's pre-bundle cache and restart the dev server:
```bash
rm -rf node_modules/.vite
npx vite
```

## Files

| File | Description |
|------|-------------|
| `server.ts` | Express.js backend with LangGraph-compatible API and LangChain agent |
| `App.tsx` | React chat UI using `useStream` from `@langchain/react` |
| `index.html` | Minimal Vite HTML entry point |
| `package.json` | Self-contained dependencies |

## Key Code Pattern

```tsx
import { useStream } from "@langchain/react";

const { messages, isLoading, submit } = useStream({
  apiUrl: "http://localhost:2024",   // Express backend URL
  assistantId: "agent",              // Must match /assistants/search response
  messagesKey: "messages",
});

// Submit a new user message
submit({ messages: [{ type: "human", content: "Hello!" }] });

// Render the message list (streams in real-time)
messages.map((msg) => <div key={msg.id}>{msg.content}</div>);
```

## How `useStream` works under the hood

1. On mount, calls `GET /assistants/search` to validate `assistantId`
2. On first `submit()`, calls `POST /threads` to create a thread
3. Sends the message via `POST /threads/:threadId/runs/stream`
4. Reads SSE events: `metadata` → `messages/partial` (multiple) → `end`
5. Each `messages/partial` event replaces the in-progress AI message with the latest accumulated text
6. On `end`, marks `isLoading = false`
