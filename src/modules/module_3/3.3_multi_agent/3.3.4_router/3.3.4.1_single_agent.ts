/**
 * ROUTER PATTERN — Single agent variant (Command)
 * ------------------------------------------------
 * A dedicated classification step routes the query to exactly ONE specialized
 * agent BEFORE any agent runs. The router is a single LLM call (not a full
 * agent); it outputs a structured classification, then issues a Command to
 * jump directly to the right node.
 *
 * Compare to other patterns:
 *   Supervisor (3.3.1) — the model dynamically decides routing on every turn,
 *     maintaining full conversation context. Best for open-ended orchestration.
 *   Router (this file) — routing is a preprocessing decision, not a
 *     conversational one. One classification call, then hand off once.
 *
 * When to use this variant (Command / single agent):
 *   - Queries map cleanly to a single domain (billing OR technical OR general)
 *   - You want fast, deterministic routing with minimal overhead
 *   - No need to query multiple sources or synthesize results
 *
 * Flow: query → router (classify) → Command(goto=agent) → agent → answer
 */

import { createAgent, initChatModel } from "langchain";
import { Annotation, Command, END, MessagesAnnotation, START, StateGraph } from "@langchain/langgraph";
import z from "zod";
import {HumanMessage} from "@langchain/core/messages";

const model = await initChatModel("gpt-4o");

// ---------------------------------------------------------------------------
// Classification schema — structured output forces a valid routing decision.
// The router model must return exactly one of the three domain values.
// ---------------------------------------------------------------------------

const RouterState = Annotation.Root({
  ...MessagesAnnotation.spec,
});

const ClassificationSchema = z.object({
  domain: z.enum(["billing", "technical", "general"]),
  reason: z.string(),
});

// ---------------------------------------------------------------------------
// Specialized agents — each owns a narrow domain
// ---------------------------------------------------------------------------

const billingAgent = createAgent({
  model,
  systemPrompt:
    "You are a billing specialist. Handle questions about invoices, " +
    "subscriptions, refunds, and payment methods. Be concise and helpful.",
});

const technicalAgent = createAgent({
  model,
  systemPrompt:
    "You are a technical support engineer. Handle questions about bugs, " +
    "integrations, APIs, and configuration. Provide step-by-step guidance.",
});

const generalAgent = createAgent({
  model,
  systemPrompt:
    "You are a general customer assistant. Handle onboarding questions, " +
    "feature explanations, and anything that doesn't fit billing or technical.",
});

// ---------------------------------------------------------------------------
// Router node — classifies the query and issues a Command to the right agent.
// This is a single LLM call, not a full agent — fast and deterministic.
// withStructuredOutput ensures the model always returns a valid domain enum.
// ---------------------------------------------------------------------------

const classifier = model.withStructuredOutput(ClassificationSchema);

async function router(state: typeof RouterState.State) {
  const result = await classifier.invoke([
    {
      role: "system",
      content:
        "Classify the user's query into one of: billing, technical, general. " +
        "billing = invoices, payments, refunds. " +
        "technical = bugs, APIs, integrations, configuration. " +
        "general = everything else.",
    },
    ...state.messages,
  ]);
  // Command.goto tells LangGraph which node to execute next
  return new Command({ goto: `${result.domain}_agent` });
}

// ---------------------------------------------------------------------------
// Agent node wrappers — invoke the agent and return its messages to the graph
// ---------------------------------------------------------------------------

const runBillingAgent = (state: typeof RouterState.State) => billingAgent.invoke(state);
const runTechnicalAgent = (state: typeof RouterState.State) => technicalAgent.invoke(state);
const runGeneralAgent = (state: typeof RouterState.State) => generalAgent.invoke(state);

// ---------------------------------------------------------------------------
// Graph — router is the single entry point; agents are the leaf nodes.
// Router uses Command(goto=...) so no explicit edges are needed from router
// to agents — LangGraph resolves the destination dynamically at runtime.
// ---------------------------------------------------------------------------

const graph = new StateGraph(RouterState)
  .addNode("router", router, { ends: ["billing_agent", "technical_agent", "general_agent"] })
  .addNode("billing_agent", runBillingAgent)
  .addNode("technical_agent", runTechnicalAgent)
  .addNode("general_agent", runGeneralAgent)
  .addEdge(START, "router")
  .addEdge("billing_agent", END)
  .addEdge("technical_agent", END)
  .addEdge("general_agent", END);

export const singleRouter = graph.compile();


// ---------------------------------------------------------------------------
// Single-agent router — routes to exactly ONE specialist based on the query.
// Input shape: MessagesAnnotation state ({ messages })
// ---------------------------------------------------------------------------

export async function runSingleRouter() {
  console.log("=== Single Router ===");

  const result = await singleRouter.invoke({
    messages: [new HumanMessage("My invoice from last month looks wrong — I was charged twice.")],
  });

  console.log(result.messages.at(-1)?.content);
}

await runSingleRouter()
