// =============================================================================
// 2-Step RAG (Retrieval-Augmented Generation)
//
// Architecture: Retrieve → Generate (always in this order)
//
// How it works:
//   1. A retrieval step ALWAYS runs first — before the LLM is invoked
//   2. The retrieved documents are injected into the prompt as context
//   3. The LLM generates an answer grounded in that context
//
// Pros:
//   ✅ Simple and predictable — max 1 retrieval + 1 LLM call
//   ✅ Easy to debug (retrieval and generation are separate, traceable steps)
//   ✅ Low and consistent latency
//   ✅ Good fit when the query always needs external knowledge (FAQs, docs bots)
//
// Cons:
//   ❌ Retrieval always happens, even for questions the LLM already knows
//   ❌ No adaptive behavior — can't refine the query if results are poor
//   ❌ A single retrieval pass may miss relevant context for complex questions
// =============================================================================

import { createAgent, initChatModel } from "langchain";
import z from "zod";

// Step 1 (at call time): Create a TavilySearch instance and call it BEFORE invoking
// the LLM. This explicit retrieval step is what defines the 2-Step pattern.
// const retriever = new TavilySearch({ maxResults: 3 });
// const docs = await retriever.invoke({ query: "..." });

// Step 2: Define the structured output shape for the generated answer.
const answerSchema = z.object({
  answer: z.string().describe("A concise answer grounded in the retrieved context"),
  sources: z.array(z.string()).describe("URLs or titles of the sources used"),
});

// Step 3: System prompt — instructs the model to use the provided context.
// The context is injected at invocation time (not by the agent itself).
const systemPrompt = `
  You are a helpful research assistant.
  You will be given a user question along with relevant context retrieved from the web.
  Your job is to answer the question using ONLY the provided context.
  If the context does not contain enough information, say so clearly.
  Always cite your sources.
`.trim();

// Step 4: Create the agent with structured output.
// NOTE: In 2-Step RAG the agent has NO tools — it only generates.
// Retrieval happens outside the agent, before invoke() is called.
export const twoStepRagAgent = createAgent({
  model: await initChatModel("gpt-4o-mini"),
  systemPrompt,
  responseFormat: answerSchema,
});

// --- How to use this agent (2-Step pattern) ---
//
// import { twoStepRagAgent } from "./4.1_rag_2step";
// import { TavilySearch } from "@langchain/tavily";
// import { HumanMessage } from "@langchain/core/messages";
//
// const retriever = new TavilySearch({ maxResults: 3 });
// const query = "What are the latest breakthroughs in fusion energy?";
//
// // STEP 1: Retrieve — explicitly fetch context before calling the LLM
// const searchResults = await retriever.invoke(query);
// const context = searchResults.map((r: any) => `${r.title}: ${r.content}`).join("\n\n");
//
// // STEP 2: Generate — pass the query + retrieved context to the LLM
// const response = await twoStepRagAgent.invoke({
//   messages: [
//     new HumanMessage(`Question: ${query}\n\nContext:\n${context}`)
//   ]
// });
//
// console.log(response);
