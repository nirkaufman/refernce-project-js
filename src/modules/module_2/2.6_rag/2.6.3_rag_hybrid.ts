// =============================================================================
// Hybrid RAG (Retrieval-Augmented Generation)
//
// Architecture: Query Enhancement → Retrieve → Validate → Generate → Validate
//
// How it works:
//   1. Query Enhancement  — an LLM rewrites the user's query for better retrieval
//   2. Retrieval          — fetch documents using the enhanced query
//   3. Relevance Check    — an LLM validates whether the docs are relevant enough
//                           if not, the query is refined and retrieval repeats
//   4. Answer Generation  — generate a grounded answer from validated context
//   5. Answer Validation  — verify the answer is complete and well-supported
//
// This is implemented as a LangGraph StateGraph so each step is a discrete node
// and conditional routing handles retry logic.
//
// Pros:
//   ✅ High quality — validation steps catch bad retrievals and weak answers
//   ✅ Handles ambiguous or underspecified queries via query enhancement
//   ✅ Iterative refinement loops improve results before returning to the user
//   ✅ Transparent pipeline — each step is a named graph node, easy to trace
//
// Cons:
//   ❌ Higher latency — multiple LLM calls per request
//   ❌ More complex to build, test, and maintain than 2-Step or Agentic RAG
//   ❌ Retry loops can increase cost unpredictably on hard queries
//   ❌ Requires careful prompt engineering for each validation step
// =============================================================================

import { StateGraph, Annotation, END } from "@langchain/langgraph";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import z from "zod";

// ---------------------------------------------------------------------------
// Graph State
// Shared state passed between all nodes in the graph.
// ---------------------------------------------------------------------------

const GraphState = Annotation.Root({
  originalQuery: Annotation<string>(),
  enhancedQuery: Annotation<string>(),
  retrievedDocs: Annotation<string>(),
  isRelevant: Annotation<boolean>(),
  answer: Annotation<string>(),
  isAnswerValid: Annotation<boolean>(),
  retryCount: Annotation<number>(),
});

// ---------------------------------------------------------------------------
// Shared resources
// ---------------------------------------------------------------------------

const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
const retriever = new TavilySearch({ maxResults: 4 });

// Zod schema for answer validation output
const validationSchema = z.object({
  isValid: z.boolean(),
  reason: z.string(),
});

// ---------------------------------------------------------------------------
// Node 1: Query Enhancement
// Rewrites the user's query to be more specific and retrieval-friendly.
// This improves recall from the vector store / search engine.
// ---------------------------------------------------------------------------

async function enhanceQuery(state: typeof GraphState.State) {
  const response = await model.invoke([
    new SystemMessage(
      "Rewrite the following user question to be more specific and optimized for web search. " +
      "Return ONLY the rewritten query, nothing else."
    ),
    new HumanMessage(state.originalQuery),
  ]);

  return { enhancedQuery: response.content as string };
}

// ---------------------------------------------------------------------------
// Node 2: Retrieve Documents
// Fetches documents using the (possibly enhanced) query.
// ---------------------------------------------------------------------------

async function retrieveDocs(state: typeof GraphState.State) {
  const query = state.enhancedQuery || state.originalQuery;
  const results = await retriever.invoke({ query });

  // Flatten search results into a single context string
  const docs = (results as any[])
    .map((r: any) => `Source: ${r.url ?? "unknown"}\n${r.content}`)
    .join("\n\n---\n\n");

  return { retrievedDocs: docs };
}

// ---------------------------------------------------------------------------
// Node 3: Relevance Check
// An LLM judges whether the retrieved docs actually address the query.
// If not, the graph loops back to retrieval with a refined query.
// ---------------------------------------------------------------------------

async function checkRelevance(state: typeof GraphState.State) {
  const structured = model.withStructuredOutput(validationSchema);
  const result = await structured.invoke([
    new SystemMessage(
      "You are a relevance judge. Given a user question and retrieved context, " +
      "decide if the context is relevant and sufficient to answer the question. " +
      "Return { isValid: true/false, reason: '...' }."
    ),
    new HumanMessage(
      `Question: ${state.originalQuery}\n\nContext:\n${state.retrievedDocs}`
    ),
  ]);

  return { isRelevant: result.isValid };
}

// ---------------------------------------------------------------------------
// Node 4: Generate Answer
// Produces the final answer grounded in the validated context.
// ---------------------------------------------------------------------------

async function generateAnswer(state: typeof GraphState.State) {
  const response = await model.invoke([
    new SystemMessage(
      "You are a research assistant. Answer the question using ONLY the provided context. " +
      "Be concise, accurate, and cite sources where possible."
    ),
    new HumanMessage(
      `Question: ${state.originalQuery}\n\nContext:\n${state.retrievedDocs}`
    ),
  ]);

  return { answer: response.content as string };
}

// ---------------------------------------------------------------------------
// Node 5: Answer Validation
// Checks that the answer is complete and well-supported by the context.
// If not, the graph can attempt one more retrieval cycle.
// ---------------------------------------------------------------------------

async function validateAnswer(state: typeof GraphState.State) {
  const structured = model.withStructuredOutput(validationSchema);
  const result = await structured.invoke([
    new SystemMessage(
      "You are an answer quality judge. Given a question, context, and a generated answer, " +
      "decide if the answer is complete and well-supported by the context. " +
      "Return { isValid: true/false, reason: '...' }."
    ),
    new HumanMessage(
      `Question: ${state.originalQuery}\n\nContext:\n${state.retrievedDocs}\n\nAnswer:\n${state.answer}`
    ),
  ]);

  return { isAnswerValid: result.isValid };
}

// ---------------------------------------------------------------------------
// Conditional routing helpers
// LangGraph calls these after each node to decide the next step.
// ---------------------------------------------------------------------------

// After relevance check: if docs aren't relevant and we haven't retried too many
// times, loop back to retrieval. Otherwise proceed to generation.
function routeAfterRelevanceCheck(state: typeof GraphState.State) {
  if (!state.isRelevant && (state.retryCount ?? 0) < 2) {
    return "retrieveDocs"; // retry with the same enhanced query
  }
  return "generateAnswer";
}

// After answer validation: if the answer is weak and we can still retry, loop back.
// Otherwise return the best answer we have.
function routeAfterAnswerValidation(state: typeof GraphState.State) {
  if (!state.isAnswerValid && (state.retryCount ?? 0) < 1) {
    return "retrieveDocs"; // try a fresh retrieval cycle
  }
  return END;
}

// ---------------------------------------------------------------------------
// Build the graph
// ---------------------------------------------------------------------------

const workflow = new StateGraph(GraphState)
  .addNode("enhanceQuery", enhanceQuery)
  .addNode("retrieveDocs", retrieveDocs)
  .addNode("checkRelevance", checkRelevance)
  .addNode("generateAnswer", generateAnswer)
  .addNode("validateAnswer", validateAnswer)

  // Define the linear path
  .addEdge("__start__", "enhanceQuery")
  .addEdge("enhanceQuery", "retrieveDocs")
  .addEdge("retrieveDocs", "checkRelevance")

  // Conditional: retry retrieval or proceed to generation
  .addConditionalEdges("checkRelevance", routeAfterRelevanceCheck, {
    retrieveDocs: "retrieveDocs",
    generateAnswer: "generateAnswer",
  })

  .addEdge("generateAnswer", "validateAnswer")

  // Conditional: retry if answer is poor, or end
  .addConditionalEdges("validateAnswer", routeAfterAnswerValidation, {
    retrieveDocs: "retrieveDocs",
    [END]: END,
  });

export const hybridRagGraph = workflow.compile();

// --- How to use this graph (Hybrid pattern) ---
//
// import { hybridRagGraph } from "./4.3_rag_hybrid";
//
// const result = await hybridRagGraph.invoke({
//   originalQuery: "What are the environmental impacts of lithium mining for EV batteries?",
//   retryCount: 0,
// });
//
// console.log("Answer:", result.answer);
// console.log("Enhanced query used:", result.enhancedQuery);
// console.log("Answer validated:", result.isAnswerValid);
