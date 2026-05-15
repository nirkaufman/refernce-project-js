# Exercise 1: The Supervisor Pattern

**Architecture:** Supervisor with Sub-Agents as Tools
**Estimated time:** 35–45 minutes
**Reference:** `src/modules/module_3/3.3_multi_agent/3.3.1_sub_agents/3.3.1_supervisor.ts`

---

## What You'll Build

A **customer feedback analysis pipeline** for a SaaS product. When a user pastes raw customer feedback, a supervisor agent orchestrates four specialized sub-agents in sequence to produce a structured support ticket with a draft reply.

The pipeline:
1. **SentimentAgent** — detects emotional tone (positive / neutral / negative / frustrated)
2. **TopicAgent** — categorizes the feedback (billing, bug, feature-request, praise, other)
3. **PriorityAgent** — assigns urgency (P1 critical / P2 high / P3 medium / P4 low)
4. **ResponseDrafterAgent** — writes a professional customer reply using all prior context

The supervisor calls each sub-agent as a tool, collects their outputs, and produces a final JSON-like ticket summary.

---

## Architecture Diagram

```
User feedback
      │
      ▼
┌─────────────┐
│  Supervisor  │  ← maintains full conversation history
└──────┬──────┘
       │  calls tools in sequence
       │
  ┌────▼────┐    ┌───────────┐    ┌──────────────┐    ┌──────────────────┐
  │Sentiment│ →  │   Topic   │ →  │   Priority   │ →  │ ResponseDrafter  │
  │  Agent  │    │   Agent   │    │    Agent     │    │     Agent        │
  └─────────┘    └───────────┘    └──────────────┘    └──────────────────┘
       │                │                │                      │
       └────────────────┴────────────────┴──────────────────────┘
                                    │
                             Final ticket summary
```

Each sub-agent is **stateless** — it receives only the input passed to it via `HumanMessage` and returns a single string result.

---

## What You'll Learn

- Creating multiple specialized agents with `createAgent()`
- Wrapping agents as callable tools using `tool()` from LangChain
- Passing results between agents via the supervisor's conversation history
- Keeping sub-agents stateless with fresh `HumanMessage` inputs
- Composing a multi-step pipeline using a single orchestrator

---

## Prerequisites

You'll need these imports at the top of your file:

```typescript
import { tool } from "@langchain/core/tools";
import { HumanMessage } from "@langchain/core/messages";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { createAgent } from "../agent/create-agent"; // adjust path as needed
```

Initialize your model:

```typescript
const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
```

---

## Step-by-Step Instructions

### Step 1: Create the four sub-agents

Each sub-agent is created with `createAgent()`. Give each a focused `systemPrompt` that describes its single responsibility. Sub-agents in this pattern do **not** need tools — they reason and respond using only the LLM.

Create these agents (prefix each with `_` to signal they are internal):
- `_sentimentAgent` — analyzes emotional tone, returns one of: `positive`, `neutral`, `negative`, `frustrated`
- `_topicAgent` — categorizes the feedback topic, returns one of: `billing`, `bug`, `feature-request`, `praise`, `other`
- `_priorityAgent` — given a sentiment and topic, assigns a priority level: `P1 critical`, `P2 high`, `P3 medium`, `P4 low`
- `_responseDrafterAgent` — writes a short, empathetic customer-facing reply (2–3 sentences)

> **Hint:** Keep system prompts concise and instructional. Tell each agent exactly what format to return its answer in.

---

### Step 2: Wrap each sub-agent as a tool

For each sub-agent, create a corresponding tool function using `tool()`. The tool should:

1. Accept a single `input` string parameter (use `z.object({ input: z.string() })`)
2. Invoke the sub-agent with `new HumanMessage(input)` — this keeps it stateless
3. Return only the last message content: `result.messages.at(-1)?.content as string`

```typescript
const callSentimentAnalyzer = tool(
  async ({ input }) => {
    const result = await _sentimentAgent.invoke({
      messages: [new HumanMessage(input)],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "sentiment_analyzer",
    description: "Analyzes the emotional tone of customer feedback. Returns: positive, neutral, negative, or frustrated.",
    schema: z.object({ input: z.string().describe("The raw customer feedback text") }),
  }
);
```

Repeat this pattern for `callTopicClassifier`, `callPriorityAssigner`, and `callResponseDrafter`.

> **Hint:** Each tool's `description` is what the supervisor reads to decide when to call it. Make it specific.

---

### Step 3: Create the supervisor agent

Create a `supervisorAgent` using `createAgent()` with all four tools registered. Write a system prompt that:

- Explains its role: orchestrate the feedback analysis pipeline
- Lists the tools available and when to call each one
- Instructs it to call tools **in order**: sentiment → topic → priority → response
- Tells it to end with a structured summary containing: sentiment, topic, priority, and the draft reply

```typescript
export const feedbackAnalysisSupervisor = createAgent({
  model,
  tools: [callSentimentAnalyzer, callTopicClassifier, callPriorityAssigner, callResponseDrafter],
  systemPrompt: `You are a customer support pipeline supervisor. ...`,
});
```

---

### Step 4: Run it

Test your supervisor with a few different feedback messages:

```typescript
const result = await feedbackAnalysisSupervisor.invoke({
  messages: [
    new HumanMessage(
      "I've been charged twice this month and no one from support has responded to my emails. This is completely unacceptable."
    ),
  ],
});

console.log(result.messages.at(-1)?.content);
```

---

## Expected Behavior

Given the input above, your supervisor should:

1. Call `sentiment_analyzer` → returns `"frustrated"`
2. Call `topic_classifier` → returns `"billing"`
3. Call `priority_assigner` with the sentiment and topic context → returns `"P1 critical"`
4. Call `response_drafter` with all context → returns a draft reply
5. Output a final summary like:

```
**Feedback Analysis Report**
- Sentiment: frustrated
- Topic: billing
- Priority: P1 critical
- Draft Reply: "We sincerely apologize for the double charge and the delay in our response.
  This is not the experience we want for you. Our billing team has been notified and will
  resolve this within 24 hours — we'll follow up directly."
```

---

## Bonus Challenges

1. **Add an EscalationAgent** — after priority is assigned, add a fifth sub-agent that decides whether to escalate to a human. Add routing logic to the supervisor: if priority is P1, always escalate.

2. **Batch processing** — wrap the supervisor in a loop that processes an array of feedback strings and produces a report for each. Track how many P1s were found.

3. **Make it stateful** — modify the supervisor to accept multi-turn conversations, so the user can ask follow-up questions like "what was the most urgent issue?" after processing multiple pieces of feedback.
