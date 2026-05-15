# Exercise: MCP Client & Agent Integration

**Module:** 3.1 MCP — Consuming MCP Tools in a LangChain Agent
**Estimated time:** 35–45 minutes
**Reference:** `src/modules/module_3/3.1_mcp/concert-client.ts` + `travel-agent.ts`

---

## What You'll Build

A **cooking assistant agent** that consumes the recipe MCP server you built in Exercise MCP-1. You'll use two connection patterns from the reference code:

1. **Phase 1 — Fetch the system prompt from the server** (using raw `Client` + `StdioClientTransport`): Connect once, retrieve the `recipe-assistant` prompt template, then close the connection.

2. **Phase 2 — Create the agent with MCP tools** (using `MultiServerMCPClient`): Connect to the same server, fetch all its tools, and create a `createAgent()` instance with those tools baked in.

As a **bonus extension**, you'll also connect to a **remote HTTP MCP server** (the pattern from `travel-agent.ts`) to demonstrate that the same `MultiServerMCPClient` supports both local stdio and remote HTTP servers.

---

## Architecture Diagram

```
Phase 1: Prompt Fetching
──────────────────────────────────────────────────────
  StdioClientTransport → spawns: npx tsx recipe-server.ts
          │
          │  RPC: prompts/get { name: "recipe-assistant", arguments: {...} }
          │
          ▼
  Raw Client receives prompt messages
          │
          ▼
  systemPrompt = extracted text
          │
  client.close()

Phase 2: Agent Creation
──────────────────────────────────────────────────────
  MultiServerMCPClient → spawns: npx tsx recipe-server.ts (new process)
          │
          │  RPC: tools/list
          │
          ▼
  tools = [search_recipes, get_recipe_details]
          │
          ▼
  createAgent({ model, tools, systemPrompt })
          │
          ▼
  Agent ready to handle cooking queries
```

---

## What You'll Learn

- Using the raw `Client` + `StdioClientTransport` to perform a one-shot RPC call
- Extracting prompt text from the `getPrompt()` response structure
- Configuring `MultiServerMCPClient` with stdio transport
- Fetching tool definitions with `mcpClient.getTools()`
- Wiring MCP tools into `createAgent()`
- The two-phase pattern: prompt fetch → agent creation
- Connecting to a remote HTTP MCP server as an alternative transport

---

## Prerequisites

```typescript
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "../agent/create-agent"; // adjust path
import { MemorySaver } from "@langchain/langgraph";
import path from "path";
```

Define the path to your server file:

```typescript
const SERVER_PATH = path.resolve(__dirname, "./recipe-server.ts");
// Adjust to wherever you saved the server from Exercise MCP-1
```

---

## Step-by-Step Instructions

### Step 1: Fetch the system prompt (Phase 1)

In this phase, you open a short-lived connection to the MCP server just to retrieve the prompt template. This is useful when the server "owns" the system prompt — clients don't hardcode it.

```typescript
async function fetchSystemPrompt(userPreferences: string): Promise<string> {
  // 1. Create the transport — this will spawn the server as a child process
  const transport = new StdioClientTransport({
    command: "npx",
    args: ["tsx", SERVER_PATH],
  });

  // 2. Create a raw MCP client
  const client = new Client(
    { name: "prompt-fetcher", version: "1.0.0" },
    { capabilities: {} }
  );

  // 3. Connect
  await client.connect(transport);

  // 4. Fetch the prompt
  const promptResult = await client.getPrompt({
    name: "recipe-assistant",
    arguments: { userPreferences },
  });

  // 5. Extract the text content from the response
  const systemPrompt =
    promptResult.messages[0]?.content.type === "text"
      ? promptResult.messages[0].content.text
      : "You are a helpful cooking assistant.";

  // 6. Close — always clean up
  await client.close();

  return systemPrompt;
}
```

> **Why close after Phase 1?** The raw `Client` uses a stdio process. If you leave it open, two processes would be attached to the same server file path when Phase 2 spawns a new one. Always close short-lived connections.

---

### Step 2: Create the agent with MCP tools (Phase 2)

Now create a persistent `MultiServerMCPClient` that will stay connected for the lifetime of the agent:

```typescript
async function createRecipeAgent(systemPrompt: string) {
  // 1. Configure MultiServerMCPClient with stdio transport
  const mcpClient = new MultiServerMCPClient({
    recipe: {
      transport: "stdio",
      command: "npx",
      args: ["tsx", SERVER_PATH],
    },
  });

  // 2. Fetch available tools from the server
  const tools = await mcpClient.getTools();
  console.log("Available MCP tools:", tools.map((t) => t.name));

  // 3. Optional: add a checkpointer for LangGraph Studio compatibility
  const checkpointer = new MemorySaver();

  // 4. Create the agent
  const agent = createAgent({
    model: "gpt-4o",
    tools,
    systemPrompt,
    checkpointer,
  });

  return { agent, mcpClient };
}
```

> **`MultiServerMCPClient` vs raw `Client`:** `MultiServerMCPClient` manages multiple servers, handles reconnection, and converts MCP tools into LangChain-compatible tool objects automatically. Use it for production agents. Use raw `Client` only for one-shot operations like prompt fetching.

---

### Step 3: Wire it all together

Combine the two phases into a single initialization function:

```typescript
export async function initializeCookingAssistant(userPreferences = "") {
  // Phase 1: get the system prompt from the server
  const systemPrompt = await fetchSystemPrompt(userPreferences);
  console.log("System prompt fetched:", systemPrompt.slice(0, 80) + "...");

  // Phase 2: create the agent with MCP tools
  const { agent, mcpClient } = await createRecipeAgent(systemPrompt);

  return { agent, mcpClient };
}
```

---

### Step 4: Test the agent

Run a few cooking queries to confirm the agent calls MCP tools correctly:

```typescript
import { HumanMessage } from "@langchain/core/messages";

async function main() {
  const { agent, mcpClient } = await initializeCookingAssistant("vegetarian");

  const queries = [
    "What Italian recipes do you have?",
    "Give me the full recipe for Avocado Toast",
    "I have eggs and pasta — what can I make?",
  ];

  for (const query of queries) {
    console.log(`\nQ: ${query}`);
    const result = await agent.invoke({
      messages: [new HumanMessage(query)],
    });
    console.log(`A: ${result.messages.at(-1)?.content}`);
  }

  // Always clean up the MCP client when done
  await mcpClient.close();
}

main().catch(console.error);
```

---

### Step 5: Inspect tool calls in the message trace

After running a query, inspect the intermediate messages to see the tool calls:

```typescript
const result = await agent.invoke({
  messages: [new HumanMessage("What Italian recipes do you have?")],
});

result.messages.forEach((msg, i) => {
  const type = msg._getType();
  const preview = msg.content?.toString().slice(0, 120) ?? "";
  console.log(`[${i}] ${type}: ${preview}`);
});
```

You should see the flow: `human` → `ai` (with tool_calls) → `tool` (MCP response) → `ai` (final answer).

---

### Step 6: Extension — Connect to a remote HTTP MCP server

This mirrors the pattern from `travel-agent.ts`. If you have access to a public MCP server over HTTP, you can add it as a second server in `MultiServerMCPClient`:

```typescript
const mcpClient = new MultiServerMCPClient({
  // Local stdio server (your recipe server)
  recipe: {
    transport: "stdio",
    command: "npx",
    args: ["tsx", SERVER_PATH],
  },
  // Remote HTTP server (e.g., a public weather or news MCP)
  weather: {
    transport: "http",
    url: "https://example-mcp-server.com", // Replace with a real endpoint
  },
});

const tools = await mcpClient.getTools();
// tools now includes both recipe tools AND weather tools
```

> **Key insight:** `MultiServerMCPClient` merges tools from all servers into a single flat array. The agent doesn't know or care which server a tool came from — it just calls whatever tools are available.

---

## Expected Behavior

```
System prompt fetched: You are a friendly and knowledgeable cooking assistant with access to...

Available MCP tools: [ 'search_recipes', 'get_recipe_details' ]

Q: What Italian recipes do you have?

[0] human: What Italian recipes do you have?
[1] ai: [tool_call: search_recipes({ query: "Italian" })]
[2] tool: Found 1 recipe(s):
         • Spaghetti Carbonara (Italian, medium, 25 min)
[3] ai: I found one Italian recipe: **Spaghetti Carbonara**! It's a classic...

A: I found one Italian recipe: Spaghetti Carbonara!...
```

---

## Bonus Challenges

1. **Resource reading** — the raw `Client` API also has a `readResource()` method. Before closing the Phase 1 connection, also read `recipes://catalog` and log the JSON. This lets you verify resource registration from Exercise MCP-1 is working correctly.

2. **Multi-turn conversation** — modify the test loop to maintain conversation state across turns. Pass `state.messages` forward so the agent remembers what was discussed earlier in the session. Test whether the agent can answer "how long does the first recipe I asked about take to make?" referencing an earlier tool result.

3. **Two local servers** — build a second minimal MCP server (e.g., a `nutritionServer` with a single `get_nutrition_info(ingredientName)` tool). Add it to `MultiServerMCPClient` alongside the recipe server. Verify that the agent can call tools from both servers in a single response — e.g., "Give me the carbonara recipe and its calorie estimate."
