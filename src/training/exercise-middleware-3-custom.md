# Exercise: Custom Middleware with Hooks

**Module:** 2.1 Middleware — Low-Level `beforeModel` / `afterModel` Hooks
**Estimated time:** 35–45 minutes
**Reference:** `src/modules/module_2/2.1_middleware/2.1.3_custom.ts`

---

## What You'll Build

A **community forum chatbot** with two custom middleware layers that you'll build from scratch using `createMiddleware()`:

1. **`contentModerationMiddleware`** (`beforeModel` hook) — scans each user message for prohibited terms before it reaches the model. If a violation is detected, it short-circuits the pipeline and returns a moderation warning directly — the model is never called.

2. **`complianceLoggerMiddleware`** (`afterModel` hook) — runs after every model response and writes a structured audit log entry to the console. This simulates a compliance requirement to keep records of all AI-generated content.

---

## Architecture Diagram

```
User message
      │
      ▼
┌──────────────────────────────────┐
│   contentModerationMiddleware    │  ← beforeModel hook
│                                  │
│  scan for prohibited terms       │
│  ├─ violation found?             │
│  │   └─ jumpTo: "end"            │  short-circuit: model is NEVER called
│  │      return warning message   │
│  └─ clean? → continue normally   │
└──────────────────────────────────┘
      │ (only if clean)
      ▼
┌──────────────────┐
│   Forum Agent    │  (LLM call happens here)
└──────────────────┘
      │
      ▼
┌──────────────────────────────────┐
│   complianceLoggerMiddleware     │  ← afterModel hook
│                                  │
│  log: timestamp, message length  │
│  log: first 80 chars of response │
│  (side effect only, no mutation) │
└──────────────────────────────────┘
      │
      ▼
Response returned to user
```

---

## What You'll Learn

- Creating custom middleware with `createMiddleware()`
- Writing a `beforeModel` hook that can **terminate execution early** with `jumpTo: "end"`
- The `canJumpTo` permission array — required for a hook to short-circuit
- Writing an `afterModel` hook for **side effects** (logging) without mutating state
- How to return `void` vs. a modified state object from hooks
- Composing multiple custom middleware instances in one agent

---

## Prerequisites

```typescript
import { createMiddleware } from "../agent/middleware"; // adjust path
import { createAgent } from "../agent/create-agent";
import { initChatModel } from "langchain/chat_models/universal";
import { AIMessage } from "@langchain/core/messages";
```

```typescript
const model = await initChatModel("gpt-4o-mini", { temperature: 0.7 });
```

---

## Step-by-Step Instructions

### Step 1: Define your prohibited terms list

Create a simple array of words/phrases the forum does not allow. Keep it small for testing — 3 to 5 entries is enough:

```typescript
const PROHIBITED_TERMS = [
  "spam",
  "buy now",
  "click here",
  "free money",
  "guaranteed profit",
];
```

---

### Step 2: Build the content moderation middleware

Use `createMiddleware()` with a `beforeModel` hook. The hook receives the current `state` and must:

1. Extract all user messages from `state.messages`
2. Concatenate and lowercase their content for scanning
3. Check whether any prohibited term appears
4. If a violation is found:
   - Return an object with `messages: [new AIMessage("...warning...")]` and `jumpTo: "end" as const`
5. If clean: return `undefined` (or nothing) to let execution continue normally

The `canJumpTo: ["end"]` permission **must** be declared in the hook config — without it, the framework will not allow the short-circuit.

```typescript
const contentModerationMiddleware = createMiddleware({
  name: "ContentModeration",
  beforeModel: {
    canJumpTo: ["end"],
    hook: (state) => {
      const userText = state.messages
        .filter((m) => m._getType() === "human")
        .map((m) => m.content?.toString().toLowerCase())
        .join(" ");

      const violation = PROHIBITED_TERMS.find((term) => userText.includes(term));

      if (violation) {
        return {
          messages: [
            new AIMessage(
              `Your message was flagged for containing prohibited content ("${violation}"). ` +
              `Please review our community guidelines and rephrase your message.`
            ),
          ],
          jumpTo: "end" as const,
        };
      }

      // Return nothing → pipeline continues to model
    },
  },
});
```

> **Key insight:** When `jumpTo: "end"` is returned, the agent's graph skips the model call entirely and routes directly to the end node. The `AIMessage` you return becomes the agent's response.

---

### Step 3: Build the compliance logger middleware

Use `createMiddleware()` with an `afterModel` hook. This hook runs **after** the model has generated a response. It should:

1. Extract the last message from `state.messages` (this is the model's response)
2. Log a structured audit entry to the console
3. Return `void` — this is a pure side-effect hook, it must not modify state

```typescript
const complianceLoggerMiddleware = createMiddleware({
  name: "ComplianceLogger",
  afterModel: (state) => {
    const lastMessage = state.messages.at(-1);
    if (!lastMessage) return;

    const logEntry = {
      timestamp: new Date().toISOString(),
      messageType: lastMessage._getType(),
      contentLength: lastMessage.content?.toString().length ?? 0,
      preview: lastMessage.content?.toString().slice(0, 80),
    };

    console.log("[COMPLIANCE LOG]", JSON.stringify(logEntry, null, 2));

    // Return nothing → state is unchanged
  },
});
```

> **Return value matters:** Returning `void` from `afterModel` means no state mutation. If you accidentally return a modified state object here, it will replace the model's output — which is almost never what you want in a logging hook.

---

### Step 4: Create the forum agent

Stack both middleware instances. **Order matters** — moderation must run first (before model), logger runs last (after model):

```typescript
export const forumAgent = createAgent({
  model,
  tools: [],
  middleware: [contentModerationMiddleware, complianceLoggerMiddleware],
  systemPrompt: `You are a helpful community forum assistant for a personal finance community. 
  
You help members with questions about budgeting, saving, and investing. 
Keep answers friendly, educational, and free of specific investment recommendations.
Always encourage members to do their own research and consult professionals for major decisions.`,
});
```

---

### Step 5: Test both paths

**Test the happy path** (clean message — should reach the model and trigger the logger):

```typescript
import { HumanMessage } from "@langchain/core/messages";

const clean = await forumAgent.invoke({
  messages: [new HumanMessage("What's a good way to start saving for a house down payment?")],
});
console.log("Response:", clean.messages.at(-1)?.content);
// Should print [COMPLIANCE LOG] to the console
```

**Test the moderation path** (prohibited content — should be blocked before the model):

```typescript
const flagged = await forumAgent.invoke({
  messages: [new HumanMessage("Click here for free money! Guaranteed profit with no risk!")],
});
console.log("Response:", flagged.messages.at(-1)?.content);
// Should return moderation warning — NO compliance log (model was never called)
```

---

## Expected Behavior

**Clean message:**
```
[COMPLIANCE LOG] {
  "timestamp": "2025-10-15T14:32:01.123Z",
  "messageType": "ai",
  "contentLength": 312,
  "preview": "Great goal! For a house down payment, a dedicated high-yield savings account..."
}
Response: Great goal! For a house down payment, a dedicated high-yield savings...
```

**Flagged message:**
```
Response: Your message was flagged for containing prohibited content ("free money").
          Please review our community guidelines and rephrase your message.
```
(No compliance log entry — the model was never invoked, so `afterModel` never ran.)

---

## Bonus Challenges

1. **Severity levels** — instead of a flat prohibited list, create two lists: `HARD_BLOCK` (always terminate, as above) and `SOFT_WARN` (let the message through but prepend a warning to the system prompt). Implement both levels in your `beforeModel` hook.

2. **Rate limiting middleware** — build a third middleware that counts how many messages are in the current conversation. If it exceeds 10, short-circuit with a "Session limit reached" message (similar to the reference code's `checkMessageLimit`). Stack it alongside the other two.

3. **Structured log output** — modify `complianceLoggerMiddleware` to append log entries to an in-memory array instead of printing to console. Expose a `getComplianceLogs()` function that returns all logged entries. This simulates a real audit trail you could later persist to a database.
