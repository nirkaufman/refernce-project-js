# Exercise 2: The Handoffs Pattern

**Architecture:** State-Driven Sequential Handoffs with Middleware
**Estimated time:** 40–50 minutes
**Reference:** `src/modules/module_3/3.3_multi_agent/3.3.2_handoffs/3.3.2_handoffs.ts`

---

## What You'll Build

A **job application screening system** for a tech company. A single agent changes its behavior at each step of the screening conversation, collecting structured information before making a final hire/waitlist/reject decision.

The agent progresses through three locked steps:
1. **`intake`** — asks what role the candidate is applying for
2. **`screen`** — asks how many years of relevant experience they have
3. **`decide`** — based on the collected role + experience, renders a decision and next steps

Each step has its own system prompt and its own set of allowed tools. The agent cannot skip ahead — the next step only unlocks after the current tool fires a state update.

---

## Architecture Diagram

```
User message
      │
      ▼
┌───────────────────────────────────────┐
│            Single Agent               │
│                                       │
│  ┌─────────────────────────────────┐  │
│  │         Middleware              │  │
│  │   reads currentStep from state  │  │
│  │   swaps system prompt + tools   │  │
│  └─────────────────────────────────┘  │
│                                       │
│   Step: "intake"                      │
│   ├─ Prompt: ask for role             │
│   └─ Tool: recordAppliedRole()        │
│        └─ writes state.appliedRole    │
│           sets currentStep="screen"  │
│                                       │
│   Step: "screen"                      │
│   ├─ Prompt: ask for experience       │
│   └─ Tool: recordExperience()         │
│        └─ writes state.yearsExp       │
│           sets currentStep="decide"  │
│                                       │
│   Step: "decide"                      │
│   ├─ Prompt: render decision          │
│   └─ Tools: acceptCandidate()         │
│             waitlistCandidate()       │
│             rejectCandidate()         │
└───────────────────────────────────────┘
```

---

## What You'll Learn

- Defining shared state with `StateSchema` and typed fields
- Using `Command` to update state and trigger step transitions
- Intercepting model calls with `createMiddleware` + `wrapModelCall`
- Accessing runtime context (`toolCallId`) via `ToolRuntime<StateType>`
- Building multi-turn conversations where the agent's persona changes per step

---

## Prerequisites

```typescript
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import {
  createAgent,
  createMiddleware,
  StateSchema,
} from "../agent/create-agent"; // adjust path as needed
import { ToolRuntime } from "../agent/types"; // adjust path as needed
import { Command } from "@langchain/langgraph";
import { ToolMessage } from "@langchain/core/messages";
import { z } from "zod";
```

Initialize your model:

```typescript
const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
```

---

## Step-by-Step Instructions

### Step 1: Define the state schema

The shared state carries information collected across steps. Define an interface and a schema for it:

```typescript
interface ScreeningStateType {
  currentStep: "intake" | "screen" | "decide";
  appliedRole: string;
  yearsOfExperience: number;
}

const ScreeningStateSchema = StateSchema<ScreeningStateType>({
  currentStep: "intake",   // starting step
  appliedRole: "",
  yearsOfExperience: 0,
});
```

> **Hint:** `currentStep` drives everything — it's the signal the middleware reads to decide which configuration to apply.

---

### Step 2: Create the data-collection tools

These tools collect one piece of information each and **hand off** to the next step by returning a `Command` that updates state.

**Tool 1: `recordAppliedRole`**
- Input schema: `{ role: string }`
- Updates: `appliedRole`, transitions `currentStep` to `"screen"`
- Must return a `Command` containing a `ToolMessage` (use `runtime.toolCallId`)

**Tool 2: `recordExperience`**
- Input schema: `{ years: number }`
- Updates: `yearsOfExperience`, transitions `currentStep` to `"decide"`
- Must also return a `Command` with a `ToolMessage`

Use this pattern:

```typescript
const recordAppliedRole = tool(
  async ({ role }, runtime: ToolRuntime<ScreeningStateType>) => {
    return new Command({
      update: {
        messages: [
          new ToolMessage({
            content: `Candidate is applying for: ${role}`,
            tool_call_id: runtime.toolCallId,
          }),
        ],
        appliedRole: role,
        currentStep: "screen",
      },
    });
  },
  {
    name: "record_applied_role",
    description: "Records the role the candidate is applying for.",
    schema: z.object({ role: z.string() }),
  }
);
```

---

### Step 3: Create the decision tools

These are the leaf tools at the `decide` step — they take action rather than collect data. They do **not** need to transition state.

Create three tools:
- `acceptCandidate` — congratulates the candidate, provides next steps (interview scheduling)
- `waitlistCandidate` — informs the candidate they're on the waitlist, gives a timeline
- `rejectCandidate` — delivers a polite rejection with encouragement to reapply

Each tool returns a plain string (no `Command` needed here).

---

### Step 4: Define the step configurations

Create a `getConfig()` function that returns the correct system prompt and tool set for each step:

```typescript
function getConfig(
  step: ScreeningStateType["currentStep"],
  role: string,
  years: number
) {
  if (step === "intake") {
    return {
      prompt: "You are a friendly recruiter. Greet the candidate and ask what role they are applying for. Use the record_applied_role tool once you have their answer.",
      tools: [recordAppliedRole],
    };
  }

  if (step === "screen") {
    return {
      prompt: `The candidate is applying for ${role}. Now ask how many years of relevant experience they have. Use the record_experience tool once you have their answer.`,
      tools: [recordExperience],
    };
  }

  // step === "decide"
  const isQualified = /* your routing logic here */ false;
  return {
    prompt: `Based on the candidate's profile (role: ${role}, experience: ${years} years), use the appropriate tool to deliver the screening decision. Be warm and professional.`,
    tools: isQualified ? [acceptCandidate] : years > 0 ? [waitlistCandidate] : [rejectCandidate],
  };
}
```

> **Think about the routing logic:** What thresholds make sense? Should a senior engineer role require more years than a junior one? How do you encode that into the decision?

---

### Step 5: Wire up the middleware

Create middleware that intercepts every model call, reads `currentStep` from state, and applies the correct configuration:

```typescript
const applyStepConfig = createMiddleware({
  wrapModelCall: (request, handler) => {
    const state = request.state as ScreeningStateType;
    const config = getConfig(state.currentStep, state.appliedRole, state.yearsOfExperience);
    return handler({
      ...request,
      systemPrompt: config.prompt,
      tools: config.tools,
    });
  },
});
```

---

### Step 6: Create and export the agent

```typescript
export const screeningAgent = createAgent({
  model,
  tools: [], // tools are injected dynamically by middleware
  stateSchema: ScreeningStateSchema,
  middleware: [applyStepConfig],
});
```

---

### Step 7: Test it

Run a multi-turn conversation that walks through all three steps:

```typescript
import { HumanMessage } from "@langchain/core/messages";

const turn1 = await screeningAgent.invoke({
  messages: [new HumanMessage("Hi, I'd like to apply for a position.")],
});
console.log(turn1.messages.at(-1)?.content);

const turn2 = await screeningAgent.invoke({
  ...turn1, // pass state forward
  messages: [...turn1.messages, new HumanMessage("I'm applying for the Senior Backend Engineer role.")],
});
console.log(turn2.messages.at(-1)?.content);

const turn3 = await screeningAgent.invoke({
  ...turn2,
  messages: [...turn2.messages, new HumanMessage("I have 6 years of experience with Node.js and TypeScript.")],
});
console.log(turn3.messages.at(-1)?.content);
```

---

## Expected Behavior

```
Turn 1 → "Hello! Welcome to our application process. What role are you applying for today?"

Turn 2 → "Great, Senior Backend Engineer! To continue screening, could you tell me
          how many years of relevant experience you have?"

Turn 3 → "Congratulations! With 6 years of experience, you're a strong fit for the
          Senior Backend Engineer role. We'd love to invite you to a technical interview.
          You'll receive a calendar invite at the email you provided within 24 hours."
```

---

## Bonus Challenges

1. **Role-specific thresholds** — make the `decide` step aware of role seniority. Junior roles require 0–2 years; senior roles require 4+. Candidates in between get waitlisted.

2. **Add a fourth step** — after `decide`, add a `"schedule"` step that collects the candidate's available time slots if they were accepted (using another `recordAvailability` tool).

3. **Rejection with feedback** — modify `rejectCandidate` to also call a sub-agent that generates personalized improvement advice based on the role and the stated experience level.
