# Exercise: Dynamic Tool Selection

**Module:** 2.3 Dynamic Agents — Filtering Available Tools at Runtime
**Estimated time:** 30–40 minutes
**Reference:** `src/modules/module_2/2.3_dynamic/2.3.3_dynamic_tools/`

---

## What You'll Build

A **project management bot** for a task tracking platform. The same agent exposes different tools depending on two independent access control signals:

- **User role (runtime)**: Viewers can only read; Editors can create and update; Admins get everything including deletion.
- **Project phase (state)**: During the `planning` phase, budget tools are available. Once the project moves to `execution`, deployment tools unlock and planning tools are locked.

You'll build one middleware per signal, demonstrating both runtime-context and state-based tool filtering.

---

## Architecture Diagram

```
All registered tools:
  read_tasks | create_task | update_task | delete_task
  set_budget | approve_budget | trigger_deploy | rollback_deploy

                    │
        ┌───────────▼───────────┐
        │  runtimeToolsMiddleware│  ← reads runtime.context.userRole
        │                       │
        │  viewer  → [read_*]   │
        │  editor  → [read_*, create_*, update_*]
        │  admin   → all tools  │
        └───────────┬───────────┘
                    │ filtered set
        ┌───────────▼───────────┐
        │  stateToolsMiddleware  │  ← reads state.projectPhase
        │                       │
        │  planning → keep only planning tools
        │  execution → keep only execution tools
        └───────────────────────┘
                    │ final tool set
                    ▼
        ┌───────────────────────┐
        │   Project Manager Bot  │
        └───────────────────────┘
```

---

## What You'll Learn

- Registering many tools and filtering with `request.tools.filter()`
- Matching tools by name prefix (e.g., `"read_"`, `"create_"`)
- Using `request.runtime.context` for permission-based filtering
- Accessing `request.state` for phase-based filtering
- Composing two `wrapModelCall` middlewares that each narrow the tool set further

---

## Prerequisites

```typescript
import { tool } from "@langchain/core/tools";
import { createMiddleware } from "../agent/middleware"; // adjust path
import { createAgent } from "../agent/create-agent";
import { StateSchema } from "../agent/state"; // adjust path
import { MessagesValue } from "../agent/state"; // adjust path
import { initChatModel } from "langchain/chat_models/universal";
import { z } from "zod";
```

```typescript
const model = await initChatModel("gpt-4o-mini", { temperature: 0 });
```

---

## Step-by-Step Instructions

### Step 1: Define the custom state schema

The project phase needs to live in shared state so the middleware can read it:

```typescript
const ProjectState = StateSchema({
  messages: MessagesValue,
  projectPhase: z.enum(["planning", "execution"]).default("planning"),
});
```

---

### Step 2: Create the tool suite

Create 8 tools — stubs are fine (return a simple string). Name them with clear prefixes so filtering by prefix is easy:

```typescript
// Read tools
const read_tasks     = tool(() => "Task list: [Task-1: Design mockups, Task-2: API spec]",
  { name: "read_tasks",     description: "List all tasks in the project", schema: z.object({}) });

const read_budget    = tool(() => "Current budget: $45,000 of $60,000 used",
  { name: "read_budget",    description: "View project budget status",    schema: z.object({}) });

// Create/Update tools
const create_task    = tool(({ title }) => `Created task: "${title}"`,
  { name: "create_task",    description: "Create a new task",   schema: z.object({ title: z.string() }) });

const update_task    = tool(({ id, status }) => `Updated task ${id} to ${status}`,
  { name: "update_task",    description: "Update task status",  schema: z.object({ id: z.string(), status: z.string() }) });

// Admin-only tools
const delete_task    = tool(({ id }) => `Deleted task ${id}`,
  { name: "delete_task",    description: "Permanently delete a task",         schema: z.object({ id: z.string() }) });

// Planning-phase tools
const set_budget     = tool(({ amount }) => `Budget set to $${amount}`,
  { name: "set_budget",     description: "Set the project budget",            schema: z.object({ amount: z.number() }) });

const approve_budget = tool(() => "Budget approved by stakeholder",
  { name: "approve_budget", description: "Mark budget as approved",           schema: z.object({}) });

// Execution-phase tools
const trigger_deploy = tool(({ env }) => `Deployment triggered to ${env}`,
  { name: "trigger_deploy", description: "Trigger a deployment to an environment", schema: z.object({ env: z.string() }) });

const rollback_deploy = tool(({ version }) => `Rolled back to version ${version}`,
  { name: "rollback_deploy", description: "Roll back to a previous version", schema: z.object({ version: z.string() }) });

const ALL_TOOLS = [
  read_tasks, read_budget,
  create_task, update_task, delete_task,
  set_budget, approve_budget,
  trigger_deploy, rollback_deploy,
];
```

---

### Step 3: Build the role-based tool middleware

```typescript
type RoleContext = {
  userRole: "viewer" | "editor" | "admin";
};

const roleBasedTools = createMiddleware({
  name: "RoleBasedTools",
  wrapModelCall: (request, handler) => {
    const { userRole } = request.runtime.context as RoleContext;
    let tools = request.tools;

    if (userRole === "viewer") {
      tools = request.tools.filter((t) => (t.name as string).startsWith("read_"));
    } else if (userRole === "editor") {
      tools = request.tools.filter((t) =>
        (t.name as string).startsWith("read_") ||
        (t.name as string).startsWith("create_") ||
        (t.name as string).startsWith("update_")
      );
    }
    // admin: all tools unchanged

    console.log(`[Tools] Role: ${userRole} → ${tools.map((t) => t.name).join(", ")}`);

    return handler({ ...request, tools });
  },
});
```

---

### Step 4: Build the phase-based tool middleware

This middleware reads `request.state` (not `request.runtime.context`) because phase is a conversation state value, not an external config:

```typescript
const phaseBasedTools = createMiddleware({
  name: "PhaseBasedTools",
  wrapModelCall: (request, handler) => {
    const state = request.state as { projectPhase?: "planning" | "execution" };
    const phase = state.projectPhase ?? "planning";

    let tools = request.tools;

    if (phase === "planning") {
      // Only planning tools; remove execution tools
      tools = request.tools.filter(
        (t) => !(t.name as string).startsWith("trigger_") &&
               !(t.name as string).startsWith("rollback_")
      );
    } else if (phase === "execution") {
      // Only execution tools; remove planning tools
      tools = request.tools.filter(
        (t) => !(t.name as string).startsWith("set_budget") &&
               !(t.name as string).startsWith("approve_")
      );
    }

    console.log(`[Tools] Phase: ${phase} → ${tools.map((t) => t.name).join(", ")}`);

    return handler({ ...request, tools });
  },
});
```

> **Ordering note:** Stack `roleBasedTools` before `phaseBasedTools`. The first pass narrows by permission, the second pass narrows further by phase. Each middleware receives the already-filtered list from the previous one.

---

### Step 5: Create the project manager agent

```typescript
export const projectManagerBot = createAgent({
  model,
  tools: ALL_TOOLS,
  stateSchema: ProjectState,
  middleware: [roleBasedTools, phaseBasedTools],
  systemPrompt: `You are a project management assistant. Help team members manage tasks, budgets, and deployments. Use the available tools to take actions when asked. Clearly explain what actions you took.`,
});
```

---

### Step 6: Test all combinations

```typescript
import { HumanMessage } from "@langchain/core/messages";

// Viewer in planning phase
const viewer = await projectManagerBot.invoke(
  { messages: [new HumanMessage("What tasks do we have and what's the budget status?")], projectPhase: "planning" },
  { configurable: { context: { userRole: "viewer" } } }
);
console.log("Viewer:", viewer.messages.at(-1)?.content);

// Editor in execution phase
const editor = await projectManagerBot.invoke(
  { messages: [new HumanMessage("Create a task called 'Fix login bug' and trigger a staging deployment")], projectPhase: "execution" },
  { configurable: { context: { userRole: "editor" } } }
);
console.log("Editor:", editor.messages.at(-1)?.content);
// Editor cannot trigger_deploy in execution phase... wait, they can by role.
// But can an editor approve_budget in execution phase? No — phase filter removes it.

// Admin in planning phase
const admin = await projectManagerBot.invoke(
  { messages: [new HumanMessage("Delete task-5 and set the budget to 80000")], projectPhase: "planning" },
  { configurable: { context: { userRole: "admin" } } }
);
console.log("Admin:", admin.messages.at(-1)?.content);
```

---

## Expected Behavior

The `[Tools]` logs confirm which tools are available for each combination:

```
[Tools] Role: viewer  → read_tasks, read_budget, set_budget, approve_budget
[Tools] Phase: planning → read_tasks, read_budget, set_budget, approve_budget
(set_budget & approve_budget present: viewer can READ but not set — agent won't call them)

[Tools] Role: editor  → read_tasks, read_budget, create_task, update_task
[Tools] Phase: execution → read_tasks, read_budget, create_task, update_task, trigger_deploy, rollback_deploy

[Tools] Role: admin   → all 9 tools
[Tools] Phase: planning → read_tasks, read_budget, create_task, update_task, delete_task, set_budget, approve_budget
```

When a viewer asks to create a task, the agent should politely explain it lacks the tool to do so.

---

## Bonus Challenges

1. **Graceful tool denial message** — instead of silently removing tools, build a wrapper that detects when the agent *tries* to call a filtered tool (by inspecting tool call names in `afterModel`) and returns a permission-denied message. This gives users informative feedback instead of silent failures.

2. **Dynamic phase transitions** — add a `transition_phase` tool that updates `state.projectPhase` from `"planning"` to `"execution"`. Only admins should have access to it. Test that calling this tool correctly unlocks execution tools in the next turn.

3. **Audit which tools were used** — modify each middleware to not just filter but also log which tool was *actually called* (inspect the AI message's `tool_calls` field in `afterModel`). Build a summary of tool usage per role over a session.
