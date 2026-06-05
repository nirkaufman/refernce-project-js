# Exercise 5: The Parallel-Agents Router

**Architecture:** Classify → Fan Out with `Send()` → Parallel Agents → Synthesize
**Estimated time:** 45–55 minutes
**Reference:** `src/modules/module_3/3.3_multi_agent/3.3.4_router/3.3.4.2_parallel_agents.ts`

---

## What You'll Build

A **product research assistant** that answers complex product questions by querying multiple knowledge sources simultaneously and synthesizing the results into a single buying recommendation.

The three knowledge agents run in parallel:

| Agent | Knows about |
|---|---|
| `reviews` | What customers say — ratings, complaints, praise, common issues |
| `specs` | Technical specifications — hardware, performance, compatibility |
| `competitors` | How the product compares to alternatives in its category |

A classifier decides which agents are needed (one, two, or all three). Each needed agent is launched in parallel via `Send()`. A synthesizer then merges all answers into one coherent recommendation.

---

## Architecture Diagram

```
User query
    │
    ▼
┌──────────┐
│  router  │  ← classifies into N domains (can be multiple)
└──────────┘
      │
      │  Send("reviews_agent", {...})
      ├──────────────────────────────────▶ ┌──────────────────┐
      │                                    │  reviews_agent   │──┐
      │  Send("specs_agent", {...})         └──────────────────┘  │
      ├──────────────────────────────────▶ ┌──────────────────┐  │
      │                                    │  specs_agent     │──┤ (parallel)
      │  Send("competitors_agent", {...})  └──────────────────┘  │
      └──────────────────────────────────▶ ┌──────────────────┐  │
                                           │competitors_agent │──┘
                                           └──────────────────┘
                                                    │
                                    all answers merged by reducer
                                                    │
                                                    ▼
                                          ┌──────────────────┐
                                          │   synthesize     │
                                          └──────────────────┘
                                                    │
                                              finalAnswer
```

Each parallel agent appends to `state.answers`. The merge reducer collects all answers without overwriting. The synthesizer reads them all and writes a unified response.

---

## What You'll Learn

- Defining custom graph state with `Annotation.Root()` and field-level merge reducers
- Using `Send()` to fan out to multiple nodes in parallel
- Why the reducer `(a, b) => [...a, ...b]` is required for parallel writes
- Splitting state between a root state (full graph) and agent state (per-branch slice)
- Implementing a synthesizer node that merges parallel results

---

## Prerequisites

```typescript
import { ChatOpenAI } from "@langchain/openai";
import {
  StateGraph,
  Annotation,
  Command,
  START,
  END,
  Send,
} from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createAgent } from "../agent/create-agent"; // adjust path as needed
```

```typescript
const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
```

---

## Step-by-Step Instructions

### Step 1: Define the state annotations

This pattern needs **two** state definitions:

**`RouterState`** — the root state shared across the entire graph. It holds the query, the answers collected from parallel agents, and the final synthesized answer.

```typescript
const RouterState = Annotation.Root({
  query: Annotation<string>(),
  answers: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
  finalAnswer: Annotation<string>(),
});
```

**`AgentState`** — the per-branch slice that each parallel agent receives. It only needs `query` (to know what to answer) and `answers` (to append its result).

```typescript
const AgentState = Annotation.Root({
  query: Annotation<string>(),
  answers: Annotation<string[]>({
    reducer: (a, b) => [...a, ...b],
    default: () => [],
  }),
});
```

> **Why the reducer matters:** When two nodes complete at the same time and both try to write to `state.answers`, LangGraph calls the reducer with both values. Without it, the second write would overwrite the first. The `[...a, ...b]` reducer appends instead.

---

### Step 2: Create the three specialist agents

Each agent is a domain expert. Create them with `createAgent()`:

- **`reviewsAgent`** — "You are a product review analyst. When answering, summarize what customers commonly praise and complain about. Cite realistic patterns (e.g., 'Most users report...'). Be specific about product categories."

- **`specsAgent`** — "You are a technical specifications expert. When answering, describe key hardware/software specs, performance benchmarks, and compatibility considerations. Use concrete numbers when possible."

- **`competitorsAgent`** — "You are a competitive analysis expert. When answering, compare the product to 2–3 main alternatives in its category. Highlight where it excels and where competitors have an advantage."

---

### Step 3: Build the agent node factory

Instead of writing three separate node functions, create a factory that generates them. Each node invokes its agent and appends a labeled answer to `state.answers`:

```typescript
const AGENTS = {
  reviews: reviewsAgent,
  specs: specsAgent,
  competitors: competitorsAgent,
};

function makeAgentNode(agentKey: keyof typeof AGENTS) {
  return async (state: typeof AgentState.State) => {
    const agent = AGENTS[agentKey];
    const result = await agent.invoke({
      messages: [new HumanMessage(state.query)],
    });
    const answer = `[${agentKey.toUpperCase()}]\n${result.messages.at(-1)?.content}`;
    return { answers: [answer] }; // reducer will merge this into state.answers
  };
}

const reviewsNode = makeAgentNode("reviews");
const specsNode = makeAgentNode("specs");
const competitorsNode = makeAgentNode("competitors");
```

---

### Step 4: Implement the router node

The router classifies the query into **one or more** domains and returns an array of `Send()` calls — one per matched domain.

Define the classification schema first:

```typescript
const ClassificationSchema = z.object({
  domains: z
    .array(z.enum(["reviews", "specs", "competitors"]))
    .describe("Which knowledge sources should answer this query. Can be multiple."),
  reason: z.string(),
});

const classifier = model.withStructuredOutput(ClassificationSchema);
```

Then implement the router:

```typescript
async function router(state: typeof RouterState.State): Promise<Command> {
  const result = await classifier.invoke([
    {
      role: "system",
      content: `You are a product research classifier. Given a user's product question, decide which knowledge sources are relevant:
- reviews: customer experiences, satisfaction, complaints, real-world usage
- specs: technical details, hardware, performance, compatibility
- competitors: how it compares to alternatives, trade-offs, category positioning

You may select one, two, or all three. Choose only what's genuinely needed.`,
    },
    { role: "user", content: state.query },
  ]);

  const validDomains = result.domains.filter((d) => d in AGENTS);
  const domainsToQuery = validDomains.length > 0 ? validDomains : Object.keys(AGENTS);

  const sends = domainsToQuery.map(
    (domain) => new Send(`${domain}_agent`, { query: state.query, answers: [] })
  );
  return new Command({ goto: sends });
}
```

> **Key insight:** The router returns an **array of `Send()` objects**, not a `Command`. Each `Send(nodeName, state)` creates an independent parallel branch. LangGraph executes them all concurrently and waits for all to complete before moving on.

---

### Step 5: Implement the synthesizer node

The synthesizer reads all collected answers and produces a coherent final recommendation:

```typescript
const synthesizer = createAgent({
  model,
  tools: [],
  systemPrompt: `You are a product research synthesizer. You receive labeled answers from multiple research sources and must produce a single, coherent buying recommendation. 
  
Organize your response with:
1. A summary verdict (buy / consider / avoid)
2. Key strengths
3. Key weaknesses or concerns
4. Best suited for: [user profile]
5. Consider instead: [alternative if relevant]

Do not repeat information across sections. Be concise and actionable.`,
});

async function synthesize(state: typeof RouterState.State) {
  const combined = state.answers.join("\n\n---\n\n");
  const prompt = `Product query: ${state.query}\n\nResearch findings:\n${combined}\n\nSynthesize a buying recommendation.`;

  const result = await synthesizer.invoke({
    messages: [new HumanMessage(prompt)],
  });

  return { finalAnswer: result.messages.at(-1)?.content as string };
}
```

---

### Step 6: Build and compile the graph

```typescript
const graph = new StateGraph(RouterState)
  .addNode("router", router, {
    ends: ["reviews_agent", "specs_agent", "competitors_agent"],
  })
  .addNode("reviews_agent", reviewsNode)
  .addNode("specs_agent", specsNode)
  .addNode("competitors_agent", competitorsNode)
  .addNode("synthesize", synthesize)
  .addEdge(START, "router")
  .addEdge("reviews_agent", "synthesize")
  .addEdge("specs_agent", "synthesize")
  .addEdge("competitors_agent", "synthesize")
  .addEdge("synthesize", END);

export const productResearchAssistant = graph.compile();
```

---

### Step 7: Test with queries of varying scope

Test a query that should trigger all three agents, one that triggers only two, and one that triggers just one:

```typescript
// Should trigger all three
const r1 = await productResearchAssistant.invoke({
  query: "Should I buy the Sony WH-1000XM5 headphones? I care about sound quality, how they compare to Bose, and whether people find them durable.",
});

// Should trigger: specs + competitors (no strong review signal)
const r2 = await productResearchAssistant.invoke({
  query: "How does the M3 MacBook Air compare to a Dell XPS 13 in terms of performance and battery life?",
});

// Should trigger: reviews only
const r3 = await productResearchAssistant.invoke({
  query: "What do people actually think of the Instant Pot Duo? Is it worth buying?",
});

console.log("Full research:", r1.finalAnswer);
console.log("\nSpec comparison:", r2.finalAnswer);
console.log("\nReview summary:", r3.finalAnswer);
```

Inspect intermediate state to verify parallelism and reducer behavior:

```typescript
// For r1, state.answers should have 3 items (one per agent)
// They can arrive in any order — the reducer appends them all
```

---

## Expected Behavior

For the Sony headphones query (r1), you should see three labeled answers collected in `state.answers`:

```
[REVIEWS]
Most users praise the noise cancellation as class-leading...

[SPECS]
The WH-1000XM5 features 30-hour battery life, Bluetooth 5.2...

[COMPETITORS]
Compared to the Bose QuietComfort 45, the Sony excels in ANC depth...
```

And a `finalAnswer` that synthesizes all three into a structured recommendation.

---

## Bonus Challenges

1. **Conditional synthesis** — if only one domain was queried, skip the synthesizer node and return the agent's answer directly. Hint: check `state.answers.length` in the synthesizer, or add a conditional edge.

2. **Domain confidence scores** — modify the `ClassificationSchema` to include a confidence score (0–1) per domain. In the router, only `Send()` to agents where confidence exceeds a threshold (e.g., 0.6). Observe how this affects which agents are invoked.

3. **Streaming synthesis** — instead of collecting all answers first, explore whether the synthesizer can begin working as soon as the first agent completes. Research LangGraph's streaming capabilities and discuss what architectural changes would be needed.
