// Long-term Memory with Store
//
// Problem: Short-term (in-thread) memory disappears when a conversation ends.
// Agents have no recollection of users across sessions.
//
// Solution: A Store — a persistent key-value database scoped by namespace and key.
// The agent can READ from and WRITE to the store via tools, giving it durable memory
// that outlives any single thread.
//
// Key concepts:
//   - namespace: a logical grouping, e.g. ["users"] or ["userId", "preferences"]
//   - key:       a unique ID within the namespace, e.g. "user_123"
//   - value:     a plain JSON object stored at that key
//
// Here we use InMemoryStore (data lives in-process, resets on restart).
// Swap it for PostgresStore in production to persist across restarts.

import * as z from "zod";
import { createAgent, tool, initChatModel, type ToolRuntime } from "langchain";
import { InMemoryStore } from "@langchain/langgraph";

// ---------------------------------------------------------------------------
// Store setup
// ---------------------------------------------------------------------------

// InMemoryStore keeps data in a JS Map — no external dependencies needed.
// For production: use PostgresStore from @langchain/langgraph-checkpoint-postgres
const store = new InMemoryStore();

// ---------------------------------------------------------------------------
// Context schema
// The agent receives a `context` object at invocation time.
// contextSchema tells LangChain the shape of that object and validates it.
// The userId here lets us namespace each user's memories separately.
// ---------------------------------------------------------------------------

const contextSchema = z.object({
  userId: z.string(),
});

// ---------------------------------------------------------------------------
// Shared data schema
// Defines the shape of a user profile stored in the store.
// The LLM uses this schema to know what fields to populate when saving.
// ---------------------------------------------------------------------------

const UserProfile = z.object({
  name: z.string().optional(),
  preferences: z.array(z.string()).optional(),
  notes: z.string().optional(),
});

// ---------------------------------------------------------------------------
// Tool: saveUserProfile
// Writes (or overwrites) the user's profile in the store.
// The agent calls this whenever the user shares personal information.
// ---------------------------------------------------------------------------

const saveUserProfile = tool(
  async (
    profile: z.infer<typeof UserProfile>,
    runtime: ToolRuntime<unknown, z.infer<typeof contextSchema>>,
  ) => {
    const { userId } = runtime.context;
    // put(namespace, key, value) — upserts the document
    // We use the module-level store directly for full type access (InMemoryStore)
    await store.put(["users"], userId, profile);
    return "Profile saved.";
  },
  {
    name: "save_user_profile",
    description: "Save or update the user's profile (name, preferences, notes).",
    schema: UserProfile,
  },
);

// ---------------------------------------------------------------------------
// Tool: getUserProfile
// Reads the user's profile back from the store.
// The agent calls this at the start of a conversation to recall who the user is.
// ---------------------------------------------------------------------------

const getUserProfile = tool(
  async (
    _: unknown,
    runtime: ToolRuntime<unknown, z.infer<typeof contextSchema>>,
  ) => {
    const { userId } = runtime.context;
    // get(namespace, key) — returns { value, key, namespace, ... } or null
    const entry = await store.get(["users"], userId);
    return entry?.value ? JSON.stringify(entry.value) : "No profile found.";
  },
  {
    name: "get_user_profile",
    description: "Look up the current user's stored profile.",
    schema: z.object({}),
  },
);

// ---------------------------------------------------------------------------
// Agent
// Both tools are passed so the agent can read AND write long-term memory.
// The store is also passed directly so the tools can access it via runtime.store.
// contextSchema wires up the per-request context (userId) to the tools.
// ---------------------------------------------------------------------------

const systemPrompt = `
  You are a friendly personal assistant with long-term memory.
  At the start of each conversation, check the user's profile with get_user_profile
  to recall who they are and what they like.
  Whenever the user shares personal information (name, preferences, goals),
  call save_user_profile to remember it for future conversations.
`.trim();

export const agentWithStore = createAgent({
  model: await initChatModel("gpt-4o-mini"),
  systemPrompt,
  tools: [getUserProfile, saveUserProfile],
  contextSchema,
  store, // store is injected into runtime.store inside each tool
});

// --- How to use ---
//
// import { agentWithStore } from "./3.2_store";
// import { HumanMessage } from "@langchain/core/messages";
//
// const userId = "user_42";
//
// // Session 1: user introduces themselves
// await agentWithStore.invoke(
//   { messages: [new HumanMessage("Hi! My name is Alex and I love hiking.")] },
//   { context: { userId } },
// );
// // Agent calls save_user_profile({ name: "Alex", preferences: ["hiking"] })
//
// // Session 2 (new thread, same userId): agent recalls the user
// const response = await agentWithStore.invoke(
//   { messages: [new HumanMessage("Do you remember me?")] },
//   { context: { userId } },
// );
// // Agent calls get_user_profile(), finds the profile, responds: "Yes, you're Alex!"
//
// const lastMsg = response.messages.at(-1);
// console.log(lastMsg?.content);
