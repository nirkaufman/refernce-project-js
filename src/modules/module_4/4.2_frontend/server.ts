/**
 * EXPRESS SERVER — LangGraph-compatible API for useStream
 * --------------------------------------------------------
 * Implements the minimal LangGraph Server REST API that the
 * @langchain/react `useStream` hook expects:
 *
 *   GET  /assistants/search          → list available assistants
 *   POST /threads                    → create a conversation thread
 *   GET  /threads/:id/state          → get thread state (empty for stateless demo)
 *   POST /threads/:id/runs/stream    → stream agent response as SSE
 *
 * Run:
 *   npx tsx server.ts
 *
 * Requires OPENAI_API_KEY in the project root .env (../../../../../../.env)
 */

import dotenv from "dotenv";
import { dirname, resolve } from "path";
import { fileURLToPath } from "url";

// Resolve .env from the project root (four directories above this file)
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: resolve(__dirname, "../../../../.env") });

import express from "express";
import cors from "cors";
import { randomUUID } from "node:crypto";
import { createAgent, initChatModel } from "langchain";
import { AIMessage, HumanMessage } from "@langchain/core/messages";

const app = express();
app.use(cors());
app.use(express.json());

// ---------------------------------------------------------------------------
// Agent — reusing the same pattern as 4.1_http_server.ts
// ---------------------------------------------------------------------------

const model = await initChatModel("gpt-4o", { temperature: 0.7 });

const agent = createAgent({
  model,
  systemPrompt: "You are a helpful assistant. Answer questions clearly and concisely.",
});

// ---------------------------------------------------------------------------
// LangGraph Server API — endpoints required by useStream
// ---------------------------------------------------------------------------

// 1. List assistants — useStream validates the assistantId against this list
app.get("/assistants/search", (_req, res) => {
  res.json([
    {
      assistant_id: "agent",
      graph_id: "agent",
      name: "Chat Agent",
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
      metadata: {},
      config: {},
    },
  ]);
});

// 1b. Get a single assistant by ID — useStream calls GET /assistants/:id on mount
app.get("/assistants/:assistantId", (req, res) => {
  const { assistantId } = req.params;
  if (assistantId !== "agent") {
    res.status(404).json({ detail: `No assistant found for "${assistantId}"` });
    return;
  }
  res.json({
    assistant_id: "agent",
    graph_id: "agent",
    name: "Chat Agent",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    metadata: {},
    config: {},
  });
});

// 2. Create a thread — returns a UUID; no persistence needed for this demo
app.post("/threads", (_req, res) => {
  res.json({
    thread_id: randomUUID(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
    status: "idle",
    metadata: {},
  });
});

// 3. Get thread state — returns an empty state (stateless demo)
app.get("/threads/:threadId/state", (_req, res) => {
  res.json({
    values: { messages: [] },
    next: [],
    checkpoint: null,
    metadata: {},
  });
});

// 4. Stream a run — the core endpoint that drives the chat
app.post("/threads/:threadId/runs/stream", async (req, res) => {
  const { input } = req.body as {
    assistant_id: string;
    input: { messages: Array<{ type: string; content: string }> };
    stream_mode?: string[];
  };

  res.setHeader("Content-Type", "text/event-stream");
  res.setHeader("Cache-Control", "no-cache");
  res.setHeader("Connection", "keep-alive");
  res.setHeader("X-Accel-Buffering", "no");

  const runId = randomUUID();
  const humanMsgId = randomUUID();
  const aiMsgId = randomUUID();

  // Send run metadata first — useStream uses the run_id internally
  res.write(`event: metadata\ndata: ${JSON.stringify({ run_id: runId })}\n\n`);

  try {
    const inputMessages = input?.messages ?? [];

    // Emit the human message(s) first so they appear in the UI immediately.
    // The LangGraph SDK "messages" event expects a tuple: [messageDict, metadata].
    // MessageTupleManager.add() uses chunk.concat() internally to accumulate
    // tokens, so human messages go out once (full content) while AI tokens
    // go out one chunk at a time with the same ID.
    for (const m of inputMessages) {
      if (m.type === "human") {
        const humanTuple = [{ id: humanMsgId, type: "human", content: m.content }, {}];
        res.write(`event: messages\ndata: ${JSON.stringify(humanTuple)}\n\n`);
      }
    }

    const langchainMessages = inputMessages.map((m) =>
      m.type === "human" ? new HumanMessage(m.content) : new AIMessage(m.content),
    );

    const eventStream = agent.streamEvents({ messages: langchainMessages }, { version: "v2" });

    for await (const event of eventStream) {
      if (event.event === "on_chat_model_stream") {
        const token: string = (event.data?.chunk?.content as string) ?? "";
        if (token) {
          // Send each token as its own chunk with the same aiMsgId.
          // The SDK's MessageTupleManager concatenates chunks by ID, so the
          // UI sees a single AI message that grows token by token.
          const aiTuple = [{ id: aiMsgId, type: "AIMessageChunk", content: token }, {}];
          res.write(`event: messages\ndata: ${JSON.stringify(aiTuple)}\n\n`);
        }
      }
    }

    res.write(`event: end\ndata: null\n\n`);
    res.end();
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    res.write(`event: error\ndata: ${JSON.stringify({ error: message })}\n\n`);
    res.end();
  }
});

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const PORT = 2024;

app.listen(PORT, () => {
  console.log(`Chat server running on http://localhost:${PORT}`);
  console.log(`useStream connects to: apiUrl="http://localhost:${PORT}", assistantId="agent"`);
});
