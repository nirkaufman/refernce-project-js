# Exercise: Dynamic System Prompts

**Module:** 2.3 Dynamic Agents — Runtime & State-Driven Prompt Injection
**Estimated time:** 35–45 minutes
**Reference:** `src/modules/module_2/2.3_dynamic/2.3.1_dynamic_prompts/`

---

## What You'll Build

An **e-commerce shopping assistant** whose persona and behavior adapt dynamically based on three different signals — each demonstrating a different mechanism for dynamic prompt injection:

| Sub-exercise | Signal source | Mechanism |
|---|---|---|
| **1a** | Runtime context (customer tier) | `dynamicSystemPromptMiddleware<Context>` |
| **1b** | Conversation state (cart size) | `dynamicSystemPromptMiddleware` (state only) |
| **1c** | User preference store | `dynamicSystemPromptMiddleware<Context>` + async `store.get()` |

You'll build all three as separate middleware instances, then compose them in one final agent.

---

## Architecture Diagram

```
Agent invocation
  ├─ runtime.context: { customerTier, sessionId }
  ├─ state.messages: [...]
  └─ runtime.store: { userId → { language: "es", tone: "formal" } }
        │
        ▼
┌───────────────────────────────────────────────┐
│     dynamicSystemPromptMiddleware             │
│                                               │
│  1a: customerTier → VIP / standard / guest    │
│  1b: cart size (from messages) → upsell hint  │
│  1c: store preferences → language / tone      │
└───────────────────────────────────────────────┘
        │
        ▼ combined appended system prompt
┌──────────────────────────┐
│  Shopping Assistant Agent │
└──────────────────────────┘
```

---

## What You'll Learn

- `dynamicSystemPromptMiddleware` with runtime context vs. state vs. store
- Defining a `contextSchema` with Zod for typed runtime context
- Async middleware with `store.get()` for persisted user preferences
- How multiple dynamic prompt middlewares stack (each appends to the base prompt)

---

## Prerequisites

```typescript
import { initChatModel } from "langchain/chat_models/universal";
import { dynamicSystemPromptMiddleware } from "../agent/middleware"; // adjust path
import { createAgent } from "../agent/create-agent";
import { InMemoryStore } from "@langchain/langgraph";
import { z } from "zod";
```

```typescript
const model = await initChatModel("gpt-4o-mini", { temperature: 0.5 });
```

---

## Step-by-Step Instructions

### Sub-exercise 1a: Runtime context → customer tier

Define a context schema for data passed at invocation time:

```typescript
type TierContext = {
  customerTier: "vip" | "standard" | "guest";
};

const contextSchema = z.object({
  customerTier: z.enum(["vip", "standard", "guest"]),
});
```

Create middleware that reads `runtime.context` and appends tier-appropriate instructions:

- **`vip`** → "Address the customer as a valued VIP member. Proactively offer early access to sales and loyalty rewards. Always suggest premium product alternatives."
- **`standard`** → "Assist the customer with product discovery and answer questions helpfully."
- **`guest`** → "The customer is not logged in. Gently encourage account creation to unlock wishlists and order tracking. Keep suggestions simple."

```typescript
const tierAwarePrompt = dynamicSystemPromptMiddleware<TierContext>(
  (_state, runtime) => {
    const tier = runtime.context.customerTier;

    if (tier === "vip") {
      return "Address the customer as a valued VIP member. ...";
    }
    if (tier === "guest") {
      return "The customer is not logged in. ...";
    }
    return "Assist the customer with product discovery...";
  },
  { contextSchema }
);
```

---

### Sub-exercise 1b: Conversation state → cart awareness

This middleware needs no context schema — it reads `state.messages` directly to infer how engaged the customer is.

Count how many times the user has asked about products (use message count as a proxy):
- If `state.messages.length > 4` → the customer is actively browsing. Append an upsell hint: "The customer has been browsing for a while. Gently suggest that popular items sell out fast and offer to help them finalize their cart."
- Otherwise → neutral behavior.

```typescript
const cartAwarePrompt = dynamicSystemPromptMiddleware((state) => {
  const messageCount = state.messages.length;

  if (messageCount > 4) {
    return "The customer has been browsing for a while. Gently note that popular items sell out quickly and offer to help them finalize their cart.";
  }
  // Return undefined or empty string for no extra instruction
});
```

> **Note:** Returning `undefined` or an empty string from the middleware means nothing is appended to the system prompt for this turn.

---

### Sub-exercise 1c: Store preferences → language and tone

This is an **async** middleware that fetches persisted user preferences from a store. The store maps a `userId` to a preferences object containing `{ language, tone }`.

```typescript
type PrefContext = {
  userId: string;
};

const prefContextSchema = z.object({
  userId: z.string(),
});

const preferenceAwarePrompt = dynamicSystemPromptMiddleware<PrefContext>(
  async (_state, runtime) => {
    const userId = runtime.context.userId;
    const store = runtime.store as InMemoryStore;

    const prefs = await store?.get(["preferences"], userId);
    if (!prefs?.value) return;

    const { language, tone } = prefs.value as { language: string; tone: string };

    return `Respond in ${language}. Use a ${tone} tone throughout the conversation.`;
  },
  { contextSchema: prefContextSchema }
);
```

---

### Sub-exercise 1d: Compose all three into one agent

Create a pre-populated store with a test user's preferences, then build the final agent stacking all three middleware:

```typescript
const prefsStore = new InMemoryStore();
await prefsStore.put(["preferences"], "user-42", {
  language: "Spanish",
  tone: "warm and friendly",
});

export const shoppingAssistant = createAgent({
  model,
  tools: [],
  middleware: [tierAwarePrompt, cartAwarePrompt, preferenceAwarePrompt],
  systemPrompt: "You are a helpful shopping assistant for an online fashion retailer.",
  store: prefsStore,
});
```

---

### Step 5: Test the combined agent

Invoke the agent with different runtime context combinations:

```typescript
import { HumanMessage } from "@langchain/core/messages";

// VIP customer with language preference
const result = await shoppingAssistant.invoke(
  { messages: [new HumanMessage("I'm looking for a gift for my partner")] },
  { configurable: { context: { customerTier: "vip", userId: "user-42" } } }
);
console.log(result.messages.at(-1)?.content);

// Guest with no preferences
const guestResult = await shoppingAssistant.invoke(
  { messages: [new HumanMessage("What's on sale?")] },
  { configurable: { context: { customerTier: "guest", userId: "unknown" } } }
);
console.log(guestResult.messages.at(-1)?.content);
```

---

## Expected Behavior

**VIP + Spanish preference:**
The agent should respond in Spanish with a warm tone and mention loyalty perks or VIP benefits.

**Guest:**
The agent should answer in English in a neutral tone and subtly suggest creating an account.

---

## Bonus Challenges

1. **Locale-aware formatting** — extend the preferences store to include a `currency` field (e.g., `"EUR"`, `"USD"`). Add logic in the middleware to append: "Always display prices in {currency}." Watch for how this interacts with the base agent behavior.

2. **Time-of-day prompt** — add a fourth middleware (no context needed) that checks `new Date().getHours()` and appends an appropriate greeting hint: "morning" before noon, "evening" after 18:00. This simulates injecting real-time environmental context.

3. **Conflicting signals** — what happens when `customerTier: "vip"` and `language: "French"` are both set? Does the agent correctly apply both? Write a test case that proves the two middlewares compose correctly without conflicting.
