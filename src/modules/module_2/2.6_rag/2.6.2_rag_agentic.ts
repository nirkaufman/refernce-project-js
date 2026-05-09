// =============================================================================
// Agentic RAG (Retrieval-Augmented Generation)
//
// Architecture: Agent decides when and how to retrieve
//
// How it works:
//   1. The LLM receives the user's question and a set of retrieval tools
//   2. The agent REASONS about whether it needs external knowledge
//   3. If yes, it invokes the retrieval tool (possibly multiple times)
//   4. It synthesizes the retrieved information and generates the final answer
//
// Pros:
//   ✅ Flexible — only retrieves when actually needed
//   ✅ Can perform multi-hop retrieval (search → find new lead → search again)
//   ✅ Handles complex, open-ended research tasks well
//   ✅ Naturally adapts its strategy to the question type
//
// Cons:
//   ❌ Variable latency — hard to predict how many LLM + retrieval calls will run
//   ❌ Harder to debug (the agent's reasoning is implicit)
//   ❌ The agent may skip retrieval on questions where it would be helpful
//   ❌ Not ideal for simple, high-throughput Q&A where consistency matters
// =============================================================================

import { createAgent, initChatModel } from "langchain";
import { TavilySearch } from "@langchain/tavily";

// The retrieval tool is given to the agent — it decides when to use it.
// This is the key difference from 2-Step RAG: the LLM controls retrieval.
const webSearch = new TavilySearch({ maxResults: 3 });

// System prompt guides the agent's retrieval behavior.
// We instruct it to use the tool proactively rather than relying on training data.
const systemPrompt = `
  You are a knowledgeable research assistant with access to real-time web search.

  When answering questions:
  - Use the web search tool for any question that involves recent events, specific facts,
    statistics, or topics where your training data may be outdated or insufficient.
  - You may search multiple times if the first results don't fully address the question.
  - Always synthesize information from search results and cite your sources.
  - For conversational questions or well-established facts, you may answer directly.
`.trim();

// The agent has the search tool in its toolkit.
// It will call it autonomously when it determines retrieval is needed.
export const agenticRagAgent = createAgent({
  model: await initChatModel("gpt-4o-mini"),
  systemPrompt,
  tools: [webSearch],
});

// --- How to use this agent (Agentic pattern) ---
//
// import { agenticRagAgent } from "./4.2_rag_agentic";
// import { HumanMessage } from "@langchain/core/messages";
//
// // The agent handles retrieval internally — no manual retrieval step needed
// const response = await agenticRagAgent.invoke({
//   messages: [
//     new HumanMessage("What were the major AI announcements at Google I/O 2025?")
//   ]
// });
//
// const lastMessage = response.messages[response.messages.length - 1];
// console.log(lastMessage.content);
//
// // For a factual question, the agent may skip the tool entirely:
// const simpleResponse = await agenticRagAgent.invoke({
//   messages: [new HumanMessage("What is the capital of France?")]
// });
// // -> Agent answers "Paris" without calling the search tool
