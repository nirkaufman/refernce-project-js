/**
 * ROUTER PATTERN — Multiple agents variant (Send / parallel fan-out)
 * ------------------------------------------------------------------
 * Unlike the single-agent variant (Command → one agent), Send fans out to
 * MULTIPLE agents SIMULTANEOUSLY when a query spans more than one domain.
 * All selected agents run in parallel; their results are collected and merged
 * by a synthesizer node into one final answer.
 *
 * Compare to the single-agent router (3.3.4.1):
 *   Single  — routes to exactly ONE agent; use when domains are mutually exclusive
 *   Parallel — routes to ONE OR MORE agents; use when a query spans multiple domains
 *
 * When to use this variant:
 *   - A query naturally spans multiple knowledge domains
 *   - You want to query all relevant sources and synthesize results
 *   - Latency matters — parallel execution is faster than sequential
 *
 * Flow:
 *   query → classify (returns list of domains)
 *         → Send to each matching agent IN PARALLEL
 *         → each agent writes its answer to state.answers (list merge)
 *         → synthesize node merges all answers into one final response
 *
 * This demo: a product knowledge base with three vertical agents:
 *   - docs_agent      : official documentation and how-tos
 *   - changelog_agent : recent releases and breaking changes
 *   - community_agent : community tips, workarounds, and FAQs
 */

import { createAgent, initChatModel } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import { Annotation, END, Send, START, StateGraph } from "@langchain/langgraph";
import z from "zod";

const model = await initChatModel("gpt-4o");

// ---------------------------------------------------------------------------
// State — shared across all nodes in the graph.
// The `answers` field uses a reducer that MERGES lists from parallel branches.
// Without the reducer, parallel branches would overwrite each other's results.
// ---------------------------------------------------------------------------

const RouterState = Annotation.Root({
  query: Annotation<string>(),
  // Each parallel agent appends its answer here.
  // The reducer (a, b) => [...a, ...b] merges lists from all parallel branches.
  answers: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  finalAnswer: Annotation<string>(),
});

// Per-agent state — what each parallel branch receives via Send
const AgentState = Annotation.Root({
  query: Annotation<string>(),
  answers: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
});

// ---------------------------------------------------------------------------
// Classification schema — router can select MULTIPLE domains at once
// ---------------------------------------------------------------------------

const ClassificationSchema = z.object({
  domains: z.array(z.string()).describe("Subset of: docs, changelog, community"),
  reason: z.string(),
});

// ---------------------------------------------------------------------------
// Specialized agents — each owns a vertical knowledge domain
// ---------------------------------------------------------------------------

const docsAgent = createAgent({
  model,
  systemPrompt:
    "You are a documentation expert. Answer questions using official docs, " +
    "API references, and getting-started guides. Be precise and cite examples.",
});

const changelogAgent = createAgent({
  model,
  systemPrompt:
    "You are a release notes expert. Answer questions about recent changes, " +
    "new features, deprecations, and breaking changes across versions.",
});

const communityAgent = createAgent({
  model,
  systemPrompt:
    "You are a community knowledge expert. Share known workarounds, " +
    "common pitfalls, and tips from the community and support forums.",
});

const AGENTS: Record<string, typeof docsAgent> = {
  docs: docsAgent,
  changelog: changelogAgent,
  community: communityAgent,
};

// ---------------------------------------------------------------------------
// Router node — classifies query into one or more domains, then fans out.
// Returns a list of Send objects — LangGraph executes ALL of them in parallel.
// Each Send creates an independent branch with its own copy of the state.
// ---------------------------------------------------------------------------

const classifier = model.withStructuredOutput(ClassificationSchema);

async function router(state: typeof RouterState.State): Promise<Send[]> {
  const result = await classifier.invoke([
    {
      role: "system",
      content:
        "Classify which knowledge sources should answer this query. " +
        "Choose one or more from: docs, changelog, community.\n" +
        "docs = official documentation, APIs, how-tos.\n" +
        "changelog = recent releases, new features, breaking changes.\n" +
        "community = workarounds, tips, known issues, FAQs.\n" +
        "Return all that are relevant.",
    },
    { role: "user", content: state.query },
  ]);

  const validDomains = result.domains.filter((d) => d in AGENTS);
  const domainsToQuery = validDomains.length > 0 ? validDomains : Object.keys(AGENTS);

  // Send dispatches each agent as an independent parallel branch.
  // Each branch receives its own copy of the state slice it needs.
  return domainsToQuery.map((domain) => new Send(`${domain}_agent`, { query: state.query, answers: [] }));
}

// ---------------------------------------------------------------------------
// Agent node factory — runs an agent and appends its labelled answer to state.
// The label (e.g. "[docs]") helps the synthesizer attribute each source.
// ---------------------------------------------------------------------------

function makeAgentNode(agent: typeof docsAgent, label: string) {
  return async (state: typeof AgentState.State) => {
    const result = await agent.invoke({
      messages: [new HumanMessage(state.query)],
    });
    const answer = `[${label}]\n${result.messages.at(-1)?.content}`;
    return { answers: [answer] }; // merged into shared state by the reducer
  };
}

const docsNode = makeAgentNode(docsAgent, "docs");
const changelogNode = makeAgentNode(changelogAgent, "changelog");
const communityNode = makeAgentNode(communityAgent, "community");

// ---------------------------------------------------------------------------
// Synthesize node — merges all parallel answers into one coherent response.
// Runs only after ALL parallel branches have completed (LangGraph guarantees this).
// ---------------------------------------------------------------------------

const synthesizer = createAgent({
  model,
  systemPrompt:
    "You are a synthesis expert. You receive answers from multiple knowledge " +
    "sources and combine them into a single, well-structured response. " +
    "Remove duplicates, resolve contradictions, and present a clear final answer.",
});

async function synthesize(state: typeof RouterState.State) {
  const combined = state.answers.join("\n\n");
  const prompt = `Original question: ${state.query}\n\nSource answers:\n${combined}`;
  const result = await synthesizer.invoke({ messages: [new HumanMessage(prompt)] });
  return { finalAnswer: result.messages.at(-1)?.content as string };
}

// ---------------------------------------------------------------------------
// Graph — router fans out via Send; all branches converge at synthesize.
// No explicit edges from router — Send handles the fan-out dynamically.
// All agent nodes share a common edge to "synthesize".
// ---------------------------------------------------------------------------

const graph = new StateGraph(RouterState)
  .addNode("router", router, { ends: ["docs_agent", "changelog_agent", "community_agent"] })
  .addNode("docs_agent", docsNode)
  .addNode("changelog_agent", changelogNode)
  .addNode("community_agent", communityNode)
  .addNode("synthesize", synthesize)
  .addEdge(START, "router")
  .addEdge("docs_agent", "synthesize")
  .addEdge("changelog_agent", "synthesize")
  .addEdge("community_agent", "synthesize")
  .addEdge("synthesize", END);

export const parallelRouter = graph.compile();


// --- Example usage ---
const result = await parallelRouter.invoke({
  query: "What changed in the latest release and are there known migration issues?",
  answers: [],
});

console.log(result.finalAnswer);
