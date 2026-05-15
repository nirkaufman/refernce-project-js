# Exercise: Dynamic Model Selection

**Module:** 2.3 Dynamic Agents — Switching Models at Runtime
**Estimated time:** 25–35 minutes
**Reference:** `src/modules/module_2/2.3_dynamic/2.3.2_dynamic_model/`

---

## What You'll Build

A **code review assistant** that automatically selects the most appropriate LLM based on two signals:

- **Conversation complexity** (state-driven): Short conversations with simple questions use a fast, cheap model. Longer, multi-turn debugging sessions with complex context switch to a more capable model.
- **Subscription plan** (runtime-driven): Free plan users always get the budget model. Pro users get the standard model. Enterprise users get the premium model — with production environment as an additional gate.

You'll implement two separate middleware instances, each demonstrating one selection strategy.

---

## Architecture Diagram

```
Model call intercepted by middleware
        │
        ▼
┌──────────────────────────────────┐
│   stateBasedModelMiddleware      │
│                                  │
│  request.messages.length ≤ 3     │──▶ fast-model (gpt-4o-mini)
│  request.messages.length > 3     │──▶ capable-model (gpt-4o)
└──────────────────────────────────┘

┌──────────────────────────────────┐
│  runtimeBasedModelMiddleware     │
│                                  │
│  plan: "enterprise" + prod env   │──▶ premium-model (gpt-4o)
│  plan: "free"                    │──▶ budget-model (gpt-4o-mini)
│  else (pro / standard)           │──▶ standard-model (gpt-4o-mini)
└──────────────────────────────────┘
        │
        ▼
  handler({ ...request, model: chosenModel })
        │
        ▼
  LLM generates response with selected model
```

---

## What You'll Learn

- Intercepting model calls with `createMiddleware({ wrapModelCall })`
- The `wrapModelCall(request, handler)` signature
- Accessing `request.messages` and `request.runtime.context` inside the interceptor
- Passing a modified model to `handler({ ...request, model })`
- Understanding why `wrapModelCall` is more powerful than `beforeModel` for model switching

---

## Prerequisites

```typescript
import { initChatModel } from "langchain/chat_models/universal";
import { createMiddleware } from "../agent/middleware"; // adjust path
import { createAgent } from "../agent/create-agent";
import { z } from "zod";
```

---

## Step-by-Step Instructions

### Step 1: Initialize three model tiers

```typescript
const fastModel     = await initChatModel("gpt-4o-mini", { temperature: 0, maxTokens: 500 });
const capableModel  = await initChatModel("gpt-4o",      { temperature: 0, maxTokens: 2000 });
const premiumModel  = await initChatModel("gpt-4o",      { temperature: 0, maxTokens: 4000 });
```

> In a real system, `premiumModel` might be a different model family altogether (e.g., o1, Claude Opus). For this exercise, use different token limits to simulate cost differentiation.

---

### Step 2: State-driven model selection

Build middleware that intercepts model calls and checks `request.messages.length`:

- **≤ 3 messages** → use `fastModel` (quick question, no deep context needed)
- **> 3 messages** → use `capableModel` (multi-turn debugging, needs more reasoning)

```typescript
const stateBasedModel = createMiddleware({
  name: "StateBasedModel",
  wrapModelCall: (request, handler) => {
    const messageCount = request.messages.length;
    const chosenModel = messageCount > 3 ? capableModel : fastModel;

    console.log(`[Model] Selecting ${messageCount > 3 ? "capable" : "fast"} model (${messageCount} messages)`);

    return handler({ ...request, model: chosenModel });
  },
});
```

> **Why `wrapModelCall` instead of `beforeModel`?** The `beforeModel` hook can read state and short-circuit, but cannot modify **which model** is called. Only `wrapModelCall` has access to the `request` object that includes the model, system prompt, and tools — giving you full control over the model call parameters.

---

### Step 3: Runtime-driven model selection

Define a context schema for the subscription plan:

```typescript
type PlanContext = {
  subscriptionPlan: "free" | "pro" | "enterprise";
  environment: "production" | "staging" | "development";
};

const contextSchema = z.object({
  subscriptionPlan: z.enum(["free", "pro", "enterprise"]),
  environment: z.enum(["production", "staging", "development"]),
});
```

Build a three-tier decision tree:

```typescript
const runtimeBasedModel = createMiddleware({
  name: "RuntimeBasedModel",
  wrapModelCall: (request, handler) => {
    const { subscriptionPlan, environment } = request.runtime.context as PlanContext;

    let chosenModel;
    let tier: string;

    if (subscriptionPlan === "enterprise" && environment === "production") {
      chosenModel = premiumModel;
      tier = "premium";
    } else if (subscriptionPlan === "free") {
      chosenModel = fastModel;
      tier = "budget";
    } else {
      chosenModel = capableModel;
      tier = "standard";
    }

    console.log(`[Model] Plan: ${subscriptionPlan}, Env: ${environment} → ${tier} tier`);

    return handler({ ...request, model: chosenModel });
  },
});
```

---

### Step 4: Create two separate agents

Build one agent per strategy so you can test them independently:

```typescript
export const stateAdaptiveReviewer = createAgent({
  model: fastModel, // default — will be overridden by middleware
  tools: [],
  middleware: [stateBasedModel],
  systemPrompt: `You are a senior software engineer conducting code reviews.
For simple questions, give concise direct answers.
For complex reviews, provide structured feedback: bugs, style issues, performance concerns, and suggested improvements.`,
});

export const planAdaptiveReviewer = createAgent({
  model: fastModel, // default — will be overridden by middleware
  tools: [],
  middleware: [runtimeBasedModel],
  systemPrompt: `You are a code review assistant. Provide feedback appropriate to the user's plan level.`,
  contextSchema,
});
```

---

### Step 5: Test both selection strategies

**Test state-based switching:**

```typescript
import { HumanMessage } from "@langchain/core/messages";

// Short conversation → should use fast model
const short = await stateAdaptiveReviewer.invoke({
  messages: [new HumanMessage("What does Array.prototype.reduce do?")],
});
console.log(short.messages.at(-1)?.content);

// Build up a longer conversation
let longSession = short;
longSession = await stateAdaptiveReviewer.invoke({
  ...longSession,
  messages: [...longSession.messages, new HumanMessage("Can you review this function: function mergeDeep(target, source) { ... }")],
});
longSession = await stateAdaptiveReviewer.invoke({
  ...longSession,
  messages: [...longSession.messages, new HumanMessage("What about edge cases with circular references?")],
});
longSession = await stateAdaptiveReviewer.invoke({
  ...longSession,
  messages: [...longSession.messages, new HumanMessage("How would you rewrite it to handle those?")],
});
// This 4th message should trigger the capable model
```

**Test runtime-based switching:**

```typescript
// Enterprise + production → premium
const enterprise = await planAdaptiveReviewer.invoke(
  { messages: [new HumanMessage("Review this authentication middleware")] },
  { configurable: { context: { subscriptionPlan: "enterprise", environment: "production" } } }
);

// Free tier → budget model
const free = await planAdaptiveReviewer.invoke(
  { messages: [new HumanMessage("Review this authentication middleware")] },
  { configurable: { context: { subscriptionPlan: "free", environment: "production" } } }
);

console.log("Enterprise:", enterprise.messages.at(-1)?.content?.toString().slice(0, 200));
console.log("Free:", free.messages.at(-1)?.content?.toString().slice(0, 200));
```

Watch the `[Model]` console logs to confirm which tier is selected for each invocation.

---

## Expected Behavior

```
[Model] Selecting fast model (1 messages)
[Model] Selecting fast model (3 messages)
[Model] Selecting capable model (5 messages)

[Model] Plan: enterprise, Env: production → premium tier
[Model] Plan: free, Env: production → budget tier
```

Enterprise users should receive more detailed, thorough code review responses (higher token limit). Free tier users get shorter, more concise feedback.

---

## Bonus Challenges

1. **Latency measurement** — wrap each `handler()` call with `Date.now()` timing. Log how long each model tier takes to respond. Build a summary after 5 calls showing average latency per tier.

2. **Token budget awareness** — modify the `stateBasedModel` middleware to also check the approximate total token count of `request.messages` (estimate 4 chars per token). If estimated tokens exceed 3000, always use the capable model regardless of message count.

3. **Combine both strategies** — create a third agent that stacks both middleware instances. What happens when they conflict? (e.g., state says fast model, but runtime says premium). Which middleware wins, and why? How would you implement a priority system where runtime always overrides state?
