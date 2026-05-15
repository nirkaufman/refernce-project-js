# Exercise: Building an MCP Server

**Module:** 3.1 MCP — Model Context Protocol Server
**Estimated time:** 40–50 minutes
**Reference:** `src/modules/module_3/3.1_mcp/concert-server.ts`

---

## What You'll Build

A standalone **recipe database MCP server** that exposes cooking expertise to any MCP-compatible client. The server registers three types of MCP capabilities:

- **Tools** — callable functions: `search_recipes` and `get_recipe_details`
- **Resource** — a static data resource: `recipes://catalog` (a JSON menu of available recipes)
- **Prompt** — a reusable prompt template: `recipe-assistant` (for building a cooking assistant)

The server runs over stdio transport, meaning any process can spawn it as a child process and communicate via standard input/output using the MCP protocol.

---

## Architecture Diagram

```
MCP Client (any)
       │
       │  stdio (stdin/stdout)
       │  JSON-RPC messages:
       │  - tools/list
       │  - tools/call { name, arguments }
       │  - resources/read { uri }
       │  - prompts/get { name, arguments }
       │
       ▼
┌──────────────────────────────────────┐
│         Recipe MCP Server            │
│                                      │
│  Tools:                              │
│  ├─ search_recipes(query)            │
│  └─ get_recipe_details(recipeName)   │
│                                      │
│  Resource:                           │
│  └─ recipes://catalog  (JSON list)   │
│                                      │
│  Prompt:                             │
│  └─ recipe-assistant(query)          │
└──────────────────────────────────────┘
```

---

## What You'll Learn

- Initializing an `McpServer` with name, version, and capabilities
- Registering tools with `server.registerTool()` — including input schemas and async handlers
- Registering a static resource with `server.registerResource()`
- Registering a prompt template with `server.registerPrompt()`
- Connecting the server to a `StdioServerTransport`
- The MCP response format: `{ content: [{ type: "text", text: "..." }] }`

---

## Prerequisites

```typescript
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
```

---

## Step-by-Step Instructions

### Step 1: Initialize the MCP server

Create a new `McpServer` instance. The `capabilities` object declares what types of MCP features your server provides:

```typescript
const server = new McpServer(
  { name: "recipe-server", version: "1.0.0" },
  {
    capabilities: {
      tools: {},
      resources: {},
      prompts: {},
    },
  }
);
```

> **Why declare capabilities upfront?** MCP clients use this to know what to request. A client will not attempt `prompts/get` if the server didn't declare `prompts: {}` in its capabilities.

---

### Step 2: Create the in-memory recipe database

Before registering tools, set up a simple in-memory dataset the tools can query:

```typescript
const RECIPES = [
  {
    name: "Spaghetti Carbonara",
    cuisine: "Italian",
    difficulty: "medium",
    time: "25 min",
    ingredients: ["spaghetti", "eggs", "pancetta", "parmesan", "black pepper"],
    steps: ["Boil pasta", "Fry pancetta", "Mix eggs and cheese", "Combine off heat"],
  },
  {
    name: "Chicken Tikka Masala",
    cuisine: "Indian",
    difficulty: "medium",
    time: "45 min",
    ingredients: ["chicken", "yogurt", "tomatoes", "cream", "garam masala", "ginger"],
    steps: ["Marinate chicken", "Grill or broil", "Make masala sauce", "Combine and simmer"],
  },
  {
    name: "Avocado Toast",
    cuisine: "Modern",
    difficulty: "easy",
    time: "10 min",
    ingredients: ["sourdough bread", "avocado", "lemon", "chili flakes", "salt"],
    steps: ["Toast bread", "Mash avocado with lemon", "Season and spread"],
  },
  {
    name: "Beef Tacos",
    cuisine: "Mexican",
    difficulty: "easy",
    time: "20 min",
    ingredients: ["ground beef", "taco shells", "salsa", "cheese", "lettuce", "cumin"],
    steps: ["Brown beef with spices", "Warm shells", "Assemble with toppings"],
  },
];
```

---

### Step 3: Register the `search_recipes` tool

This tool takes a freeform search query and returns matching recipes:

```typescript
server.registerTool(
  "search_recipes",
  {
    title: "Search Recipes",
    description: "Search for recipes by keyword, cuisine, or ingredient. Returns matching recipe names and basic info.",
    inputSchema: {
      query: z.string().describe("Search query — can be a cuisine type, ingredient, or dish name"),
    },
  },
  async ({ query }) => {
    const q = query.toLowerCase();
    const matches = RECIPES.filter(
      (r) =>
        r.name.toLowerCase().includes(q) ||
        r.cuisine.toLowerCase().includes(q) ||
        r.ingredients.some((i) => i.toLowerCase().includes(q))
    );

    if (matches.length === 0) {
      return { content: [{ type: "text", text: `No recipes found matching "${query}".` }] };
    }

    const summary = matches
      .map((r) => `• ${r.name} (${r.cuisine}, ${r.difficulty}, ${r.time})`)
      .join("\n");

    return { content: [{ type: "text", text: `Found ${matches.length} recipe(s):\n${summary}` }] };
  }
);
```

---

### Step 4: Register the `get_recipe_details` tool

This tool returns the full recipe — ingredients and step-by-step instructions:

```typescript
server.registerTool(
  "get_recipe_details",
  {
    title: "Get Recipe Details",
    description: "Get the full ingredients list and cooking steps for a specific recipe by name.",
    inputSchema: {
      recipeName: z.string().describe("The exact name of the recipe (e.g., 'Spaghetti Carbonara')"),
    },
  },
  async ({ recipeName }) => {
    const recipe = RECIPES.find(
      (r) => r.name.toLowerCase() === recipeName.toLowerCase()
    );

    if (!recipe) {
      return {
        content: [{ type: "text", text: `Recipe "${recipeName}" not found. Try search_recipes first.` }],
      };
    }

    const details = [
      `**${recipe.name}** (${recipe.cuisine} · ${recipe.difficulty} · ${recipe.time})`,
      `\nIngredients:\n${recipe.ingredients.map((i) => `  - ${i}`).join("\n")}`,
      `\nSteps:\n${recipe.steps.map((s, i) => `  ${i + 1}. ${s}`).join("\n")}`,
    ].join("\n");

    return { content: [{ type: "text", text: details }] };
  }
);
```

> **Response format:** MCP tool responses must return `{ content: [{ type: "text", text: string }] }`. The `type: "text"` field is required — MCP also supports `"image"` and `"resource"` content types.

---

### Step 5: Register the recipe catalog resource

Resources are static or semi-static data that clients can read by URI. Register the full recipe catalog:

```typescript
server.registerResource(
  "catalog",
  "recipes://catalog",
  {
    title: "Recipe Catalog",
    description: "Complete catalog of available recipes with names, cuisines, and difficulty levels.",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(
          RECIPES.map(({ name, cuisine, difficulty, time }) => ({ name, cuisine, difficulty, time })),
          null,
          2
        ),
      },
    ],
  })
);
```

---

### Step 6: Register the `recipe-assistant` prompt template

Prompts are reusable message templates clients can fetch and use to seed an agent's system prompt:

```typescript
server.registerPrompt(
  "recipe-assistant",
  {
    title: "Recipe Assistant",
    description: "A system prompt that configures an LLM to act as a knowledgeable cooking assistant using this server's recipe database.",
    argsSchema: {
      userPreferences: z.string().describe("Optional dietary preferences or restrictions (e.g., 'vegetarian, nut allergy')"),
    },
  },
  ({ userPreferences }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are a friendly and knowledgeable cooking assistant with access to a recipe database.

You can search for recipes by ingredient, cuisine, or dish name, and retrieve full cooking instructions.

${userPreferences ? `User preferences/restrictions: ${userPreferences}` : "No specific dietary restrictions provided."}

Always suggest recipes appropriate to the user's skill level. When giving instructions, be encouraging and explain the 'why' behind key cooking techniques.`,
        },
      },
    ],
  })
);
```

---

### Step 7: Connect to stdio transport and start the server

```typescript
const transport = new StdioServerTransport();
await server.connect(transport);
console.error("Recipe MCP server running on stdio");
```

> **`console.error` not `console.log`:** In stdio transport, stdout is reserved for MCP protocol messages. Use `console.error` for any diagnostic output — it goes to stderr and won't corrupt the protocol stream.

---

### Step 8: Test the server manually

You can test your server using the MCP inspector or by connecting a client. A quick manual test:

```bash
# Run the server directly
npx tsx src/training/recipe-server.ts

# In another terminal, you can pipe test messages
# Or use the MCP inspector tool if installed
npx @modelcontextprotocol/inspector src/training/recipe-server.ts
```

---

## Expected Behavior

When connected, a client should be able to:

1. **List tools** → receive `search_recipes` and `get_recipe_details`
2. **Call `search_recipes({ query: "Italian" })`** → receive spaghetti carbonara result
3. **Call `get_recipe_details({ recipeName: "Avocado Toast" })`** → receive full recipe
4. **Read `recipes://catalog`** → receive JSON catalog of all 4 recipes
5. **Get prompt `recipe-assistant({ userPreferences: "vegetarian" })`** → receive configured system prompt

---

## Bonus Challenges

1. **Add a `suggest_substitution` tool** — given an ingredient name, suggest 2–3 substitutes. This tests your ability to add a third tool and handle a more complex query pattern.

2. **Dynamic resource** — modify the catalog resource to accept a URI parameter like `recipes://catalog?cuisine=Italian` and filter the catalog by cuisine. Research how MCP resource URIs support parameters.

3. **Rating system** — add an in-memory `ratings` map and two new tools: `rate_recipe(name, stars)` and `get_top_rated()`. This adds stateful mutation to the server and tests whether state persists across multiple tool calls in the same server process.
