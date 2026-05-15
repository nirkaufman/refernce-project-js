# Exercise 4: The Single-Agent Router

**Architecture:** Classify Once → `Command(goto)` → One Specialist Agent
**Estimated time:** 30–40 minutes
**Reference:** `src/modules/module_3/3.3_multi_agent/3.3.4_router/3.3.4.1_single_agent.ts`

---

## What You'll Build

A **travel booking assistant** that routes every user query to exactly one specialist agent based on the nature of the request. A lightweight router node classifies the query first, then the graph deterministically hands off to the right expert.

The three specialists:

| Domain | Handles |
|---|---|
| `flights` | Flight searches, seat classes, layovers, airline comparisons, check-in |
| `hotels` | Hotel recommendations, amenities, location, pet policies, cancellation |
| `itinerary` | Multi-day trip planning, day-by-day schedules, activity sequencing |

The router makes a single LLM call to classify the query, issues a `Command(goto=...)` to the matching agent, and that agent handles everything from there.

---

## Architecture Diagram

```
User query
    │
    ▼
┌──────────┐        ┌────────────────┐
│  router  │──────▶ │  flight_agent  │──▶ END
│  (node)  │        └────────────────┘
│          │
│ classify │──────▶ ┌────────────────┐
│ via LLM  │        │  hotel_agent   │──▶ END
│          │        └────────────────┘
│ Command  │
│ (goto)   │──────▶ ┌────────────────────┐
└──────────┘        │  itinerary_agent   │──▶ END
                    └────────────────────┘

Graph: START → router → [one of the three agents] → END
```

The router never interacts with the user — it only classifies. The selected agent handles the full response.

---

## What You'll Learn

- Building a `StateGraph` with `MessagesAnnotation` shared state
- Forcing structured LLM output with `withStructuredOutput()`
- Using `Command` with `goto` for dynamic routing inside a node
- Declaring possible routing targets with `.addNode(..., { ends: [...] })`
- Connecting graph nodes with `.addEdge()` and compiling with `.compile()`

---

## Prerequisites

```typescript
import { ChatOpenAI } from "@langchain/openai";
import { StateGraph, MessagesAnnotation, START, END, Command } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { z } from "zod";
import { createAgent } from "../agent/create-agent"; // adjust path as needed
```

```typescript
const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
```

---

## Step-by-Step Instructions

### Step 1: Create the three specialist agents

Each agent is created with `createAgent()`. Give each a focused system prompt that describes its expertise. These agents have no tools for this exercise — they only need to generate a helpful conversational response.

```typescript
const flightAgent = createAgent({
  model,
  tools: [],
  systemPrompt: "You are a flight booking specialist. Help users find flights, compare airlines, understand seat classes, and navigate check-in processes. Be specific and practical.",
});

const hotelAgent = createAgent({
  model,
  tools: [],
  systemPrompt: "You are a hotel booking specialist. ...",
});

const itineraryAgent = createAgent({
  model,
  tools: [],
  systemPrompt: "You are a travel itinerary planner. ...",
});
```

---

### Step 2: Define the classification schema

The router calls the LLM with structured output to classify the query. Define the schema:

```typescript
const ClassificationSchema = z.object({
  domain: z.enum(["flights", "hotels", "itinerary"]),
  reason: z.string().describe("One sentence explaining why this domain was chosen"),
});
```

Create the classifier by calling `.withStructuredOutput()` on the model:

```typescript
const classifier = model.withStructuredOutput(ClassificationSchema);
```

> **Important:** `withStructuredOutput` forces the LLM to return a JSON object matching your Zod schema. The model will not emit free text — it will always produce a structured result.

---

### Step 3: Implement the router node function

The router is a plain async function (a "node") that:
1. Invokes the classifier with a system prompt and the user's messages
2. Maps the classified domain to the corresponding node name
3. Returns `new Command({ goto: nodeName })`

```typescript
async function router(state: typeof MessagesAnnotation.State) {
  const result = await classifier.invoke([
    {
      role: "system",
      content: `You are a travel query classifier. Classify the user's query into exactly one of:
- flights: questions about flights, airlines, airports, or air travel
- hotels: questions about accommodations, hotels, or lodging
- itinerary: questions about trip planning, schedules, or multi-day activities

Choose the single best match.`,
    },
    ...state.messages,
  ]);

  const nodeMap: Record<string, string> = {
    flights: "flight_agent",
    hotels: "hotel_agent",
    itinerary: "itinerary_agent",
  };

  return new Command({ goto: nodeMap[result.domain] });
}
```

---

### Step 4: Implement the agent node functions

Each agent node wraps the corresponding specialist agent. The node receives the graph state, invokes the agent, and returns updated messages:

```typescript
async function runFlightAgent(state: typeof MessagesAnnotation.State) {
  const result = await flightAgent.invoke({ messages: state.messages });
  return { messages: result.messages };
}

async function runHotelAgent(state: typeof MessagesAnnotation.State) {
  // same pattern
}

async function runItineraryAgent(state: typeof MessagesAnnotation.State) {
  // same pattern
}
```

---

### Step 5: Build and compile the graph

Assemble all nodes into a `StateGraph`. The router node must declare its possible destination nodes using `{ ends: [...] }`:

```typescript
const graph = new StateGraph(MessagesAnnotation)
  .addNode("router", router, {
    ends: ["flight_agent", "hotel_agent", "itinerary_agent"],
  })
  .addNode("flight_agent", runFlightAgent)
  .addNode("hotel_agent", runHotelAgent)
  .addNode("itinerary_agent", runItineraryAgent)
  .addEdge(START, "router")
  .addEdge("flight_agent", END)
  .addEdge("hotel_agent", END)
  .addEdge("itinerary_agent", END);

export const travelRouter = graph.compile();
```

---

### Step 6: Test the routing

Run a test for each domain to confirm routing works correctly:

```typescript
// Should route to: flight_agent
const r1 = await travelRouter.invoke({
  messages: [new HumanMessage("What's the difference between business class and premium economy on long-haul flights?")],
});

// Should route to: hotel_agent
const r2 = await travelRouter.invoke({
  messages: [new HumanMessage("I'm traveling with my dog to Paris for two weeks. Can you suggest pet-friendly hotels near the Marais?")],
});

// Should route to: itinerary_agent
const r3 = await travelRouter.invoke({
  messages: [new HumanMessage("I have 5 days in Tokyo. I want to see temples, eat ramen, and visit Akihabara. Can you plan a day-by-day schedule?")],
});

console.log("Flight agent:", r1.messages.at(-1)?.content);
console.log("Hotel agent:", r2.messages.at(-1)?.content);
console.log("Itinerary agent:", r3.messages.at(-1)?.content);
```

To confirm which agent handled each request, add a `console.log` inside each agent node before the invoke call.

---

## Expected Behavior

Each query should route cleanly to exactly one agent. The agent's response should reflect its specific domain expertise:

```
Flight agent: "Business class typically includes lie-flat seats on long-haul routes,
lounge access, and a higher baggage allowance. Premium economy offers more legroom
and a reclinable seat but without the lie-flat option or full lounge access. For
flights under 8 hours, premium economy is usually the better value..."

Hotel agent: "Paris has several excellent pet-friendly hotels in the Marais. Hôtel du
Petit Moulin and Hôtel de la Bretonnerie both accept dogs under 10kg. The Marais is
also very walkable for pets — the Place des Vosges garden is just steps away..."

Itinerary agent: "Here's a 5-day Tokyo itinerary:
Day 1: Asakusa & Senso-ji temple...
Day 2: Shibuya & Harajuku...
..."
```

---

## Bonus Challenges

1. **Ambiguous query handling** — what happens if a user asks "I need help planning a Paris trip including flights and a hotel"? Observe how the classifier behaves. Add a fallback domain (`"general"`) and a general travel agent that handles mixed queries.

2. **Add routing logging** — modify the router to log `result.reason` to the console before issuing the `Command`. This makes routing decisions transparent and is a useful debugging technique.

3. **Multi-turn routing** — right now the graph handles one query at a time. Wrap `travelRouter.invoke()` in a loop that accepts user input from `stdin` and routes each message. Track whether conversation history should be passed between turns (should it? why or why not?).
