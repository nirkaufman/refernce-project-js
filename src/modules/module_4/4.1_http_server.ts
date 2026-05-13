/**
 * HTTP SERVER DEMO — Streaming agent over HTTP
 * --------------------------------------------
 * A minimal Node.js HTTP server (no framework) that exposes a single endpoint:
 *   POST /chat  →  accepts { "prompt": "..." } and streams the agent's reply
 *                  back to the caller as Server-Sent Events (SSE).
 *
 * Run:
 *   npx tsx src/modules/module_4/4.1_http_server.ts
 */

import "dotenv/config"; // loads .env into process.env
import http from "node:http";
import type { IncomingMessage, ServerResponse } from "node:http";
import { createAgent, initChatModel } from "langchain";
import { HumanMessage } from "@langchain/core/messages";

// ---------------------------------------------------------------------------
// Agent — a minimal conversational assistant, no external tools needed.
// ---------------------------------------------------------------------------

const model = await initChatModel("gpt-4o", { temperature: 0.7 });

const agent = createAgent({
  model,
  systemPrompt: "You are a helpful assistant. Answer questions clearly and concisely.",
});

// ---------------------------------------------------------------------------
// How to call this server with curl:
//
// 1. Basic test — raw SSE output printed to terminal:
//
//    curl -X POST http://localhost:3000/chat \
//         -H "Content-Type: application/json" \
//         -d '{"prompt": "What is the capital of France?"}'
//
// 2. Streaming-aware — --no-buffer flushes each token to stdout immediately:
//
//    curl --no-buffer -X POST http://localhost:3000/chat \
//         -H "Content-Type: application/json" \
//         -d '{"prompt": "Tell me a short story about a robot."}'
//
// 3. Stream to a file while watching live:
//
//    curl --no-buffer -X POST http://localhost:3000/chat \
//         -H "Content-Type: application/json" \
//         -d '{"prompt": "Explain SSE in one paragraph."}' | tee output.txt
//
// Each line arrives as:   data: <token>
// The final line is:      data: [DONE]
// ---------------------------------------------------------------------------

// ---------------------------------------------------------------------------
// Helper — buffer the request body into a single string.
// ---------------------------------------------------------------------------

function readBody(req: IncomingMessage): Promise<string> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on("data", (chunk: Buffer) => chunks.push(chunk));
    req.on("end", () => resolve(Buffer.concat(chunks).toString("utf-8")));
    req.on("error", reject);
  });
}

// ---------------------------------------------------------------------------
// Request handler — route guard, JSON parse, SSE stream.
// ---------------------------------------------------------------------------

async function handleRequest(
  req: IncomingMessage,
  res: ServerResponse,
): Promise<void> {
  if (req.method !== "POST" || req.url !== "/chat") {
    res.writeHead(404, { "Content-Type": "text/plain" });
    res.end("Not found. Use: POST /chat");
    return;
  }

  try {
    const raw = await readBody(req);
    const body = JSON.parse(raw) as { prompt?: unknown };
    const prompt = body.prompt;

    if (!prompt || typeof prompt !== "string") {
      res.writeHead(400, { "Content-Type": "text/plain" });
      res.end('Missing or invalid "prompt" field');
      return;
    }

    // SSE headers must be written before the first res.write()
    res.writeHead(200, {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive",
      "X-Accel-Buffering": "no", // prevents nginx from buffering SSE chunks
    });

    // streamEvents (v2) yields fine-grained events; on_chat_model_stream
    // fires once per token emitted by the underlying chat model.
    const stream = agent.streamEvents(
      { messages: [new HumanMessage(prompt)] },
      { version: "v2" },
    );

    for await (const event of stream) {
      if (event.event === "on_chat_model_stream") {
        const token: string = (event.data?.chunk?.content as string) ?? "";
        if (token) {
          res.write(`data: ${token}\n\n`);
        }
      }
    }

    res.write("data: [DONE]\n\n");
    res.end();
  } catch (err: unknown) {
    const message =
      typeof err === "object" && err !== null && "message" in err
        ? String((err as { message: unknown }).message)
        : String(err);
    if (!res.headersSent) {
      res.writeHead(500, { "Content-Type": "text/plain" });
      res.end(`Server error: ${message}`);
    } else {
      // SSE stream already started — signal the error inside the stream
      res.write(`data: [ERROR] ${message}\n\n`);
      res.end();
    }
  }
}

// ---------------------------------------------------------------------------
// Server startup
// ---------------------------------------------------------------------------

const PORT = 3000;

http.createServer((req, res) => { void handleRequest(req, res); }).listen(PORT, () => {
  console.log(`HTTP server running on http://localhost:${PORT}`);
  console.log(`POST /chat  →  streams SSE tokens`);
});
