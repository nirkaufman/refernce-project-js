# Exercise: Summarization Middleware

**Module:** 2.1 Middleware — Automatic Conversation Compression
**Estimated time:** 25–35 minutes
**Reference:** `src/modules/module_2/2.1_middleware/2.1.2_summary.ts`

---

## What You'll Build

A **DevOps incident response chatbot** that helps engineers debug production issues. Debugging sessions can be long and highly detailed — engineers paste logs, stack traces, and config snippets across many turns. Without compression, the context window fills up quickly and costs spike.

You'll add summarization middleware that automatically compresses older parts of the conversation once a token threshold is reached, while keeping the most recent exchanges intact so the agent maintains immediate context.

---

## Architecture Diagram

```
Turn 1:  "Our API latency spiked at 14:32 UTC..."
Turn 2:  "Here's the nginx error log: [500 lines]"
Turn 3:  "And the Kubernetes pod status: [long output]"
Turn 4:  "Can you check this prometheus query?"
Turn 5:  "Still no luck, here's the trace..."
            │
            ▼
┌──────────────────────────────────────────┐
│         summarizationMiddleware          │
│                                          │
│  Trigger: 200 tokens reached             │
│  Keep: last 2 messages                   │
│  Action: compress turns 1–3 into summary │
│                                          │
│  Compressed history →                    │
│    "Engineer reported API latency spike  │
│     at 14:32. Nginx logs showed 502s.    │
│     Kubernetes pods appeared healthy."   │
│                                          │
│  + Last 2 messages kept verbatim         │
└──────────────────────────────────────────┘
            │
            ▼
┌──────────────────────────┐
│  Incident Response Agent │  (receives compressed history)
└──────────────────────────┘
```

---

## What You'll Learn

- Configuring `summarizationMiddleware()` with token-based triggers
- Using two separate model instances: one for conversation, one for summarization
- Understanding the `trigger` and `keep` options and their trade-offs
- Why a lighter/cheaper model is appropriate for summarization

---

## Prerequisites

```typescript
import { initChatModel } from "langchain/chat_models/universal";
import { summarizationMiddleware } from "../agent/middleware"; // adjust path
import { createAgent } from "../agent/create-agent";
import { HumanMessage } from "@langchain/core/messages";
```

---

## Step-by-Step Instructions

### Step 1: Initialize two separate models

The summarization middleware uses a **dedicated model** just for compression. This is intentional:
- The **conversation model** should be capable (it handles complex technical reasoning)
- The **summarization model** can be lighter and cheaper (it only needs to compress text)

```typescript
const conversationModel = await initChatModel("gpt-4o", {
  temperature: 0,
  maxTokens: 2000,
});

const summarizationModel = await initChatModel("gpt-4o-mini", {
  temperature: 0,
  maxTokens: 500,
});
```

> **Why separate models?** Summarization is a simpler task than incident diagnosis. Using a smaller model for compression cuts cost without sacrificing answer quality.

---

### Step 2: Configure the summarization middleware

Create the middleware with parameters that make sense for a technical debugging context:

```typescript
const compressionMiddleware = summarizationMiddleware({
  model: summarizationModel,
  trigger: { tokens: 300 },  // compress when history exceeds 300 tokens
  keep:    { messages: 3 },  // always keep the 3 most recent exchanges
});
```

Think carefully about these values:

- **`trigger.tokens`** — lower = more aggressive compression (compresses sooner), higher = more history preserved before compression kicks in. For debugging, you want enough raw context to stay available.
- **`keep.messages`** — how many recent messages to preserve verbatim. Keeping the last 3 ensures the agent always has the most recent logs/commands in full.

> **Experiment:** Try changing `keep.messages` to 1 and observe how it affects the agent's ability to answer follow-up questions about recent exchanges.

---

### Step 3: Create the incident response agent

Build the agent with a detailed system prompt that reflects the DevOps domain:

```typescript
export const incidentResponseAgent = createAgent({
  model: conversationModel,
  tools: [],
  middleware: [compressionMiddleware],
  systemPrompt: `You are a senior SRE (Site Reliability Engineer) helping debug production incidents.

Your approach:
1. Ask for symptoms, error logs, and timeline first
2. Hypothesize the most likely root causes (network, database, memory, deployment)
3. Suggest specific diagnostic commands or queries to confirm/rule out each hypothesis
4. Once root cause is identified, propose a remediation plan with rollback steps

Be concise and technical. Use structured lists. Prioritize high-impact checks first.
If you lack information to diagnose, ask one targeted clarifying question at a time.`,
});
```

---

### Step 4: Simulate a long debugging session

Run a multi-turn conversation that will trigger compression:

```typescript
// Build up conversation across multiple invocations
let state = await incidentResponseAgent.invoke({
  messages: [new HumanMessage("Our checkout service latency jumped from 80ms to 4s at 09:15 UTC. Users are getting timeouts.")],
});

state = await incidentResponseAgent.invoke({
  ...state,
  messages: [
    ...state.messages,
    new HumanMessage("Here are the application logs:\n[ERROR] Database pool exhausted - 500 connections active\n[WARN] Connection wait time: 3800ms\n[ERROR] Request timeout after 4000ms"),
  ],
});

state = await incidentResponseAgent.invoke({
  ...state,
  messages: [
    ...state.messages,
    new HumanMessage("kubectl get pods shows all pods running. CPU is at 15%, memory at 60%."),
  ],
});

state = await incidentResponseAgent.invoke({
  ...state,
  messages: [
    ...state.messages,
    new HumanMessage("We deployed a new release at 09:10 UTC, 5 minutes before the incident."),
  ],
});

console.log(state.messages.at(-1)?.content);
```

---

### Step 5: Inspect the compressed history

After enough turns, the middleware should have compressed earlier messages. Inspect the message array to see the summary in action:

```typescript
state.messages.forEach((msg, i) => {
  const type = msg._getType();
  const preview = msg.content?.toString().slice(0, 100);
  console.log(`[${i}] ${type}: ${preview}`);
});
```

You should see an early message that looks like a summary (shorter, prose-style) followed by the most recent messages in full.

---

## Expected Behavior

After 4+ turns of detailed technical exchanges, the compressed message history should look something like:

```
[0] system: You are a senior SRE...
[1] ai: [SUMMARY] Engineer reported 4s latency spike at 09:15 UTC in checkout service.
         Database pool exhaustion (500 active connections, 3800ms wait) identified.
         Kubernetes pods healthy. CPU and memory normal.
[2] human: We deployed a new release at 09:10 UTC, 5 minutes before the incident.
[3] ai: The timing strongly suggests the new release introduced a connection leak or
         removed a connection limit guard. I recommend: 1) Immediately roll back the
         09:10 deployment...
```

---

## Bonus Challenges

1. **Tune the threshold** — change `trigger.tokens` to `100` and re-run. Observe how aggressively the middleware compresses. Then try `1000`. At what threshold does the agent start losing important diagnostic context?

2. **Message-based trigger** — the `trigger` option also supports `{ messages: N }` instead of tokens. Change your config to trigger on 4 messages instead. Compare the compression behavior — what are the trade-offs between token-based and message-based triggers?

3. **Custom summarization prompt** — research whether `summarizationMiddleware` accepts a custom summarization instruction. If so, write a prompt that tells the summarizer to preserve all error codes, timestamps, and service names verbatim in the summary, since those are critical for incident timelines.
