/**
 * SUBAGENTS / SUPERVISOR PATTERN
 * --------------------------------
 * A central "supervisor" agent orchestrates specialized sub-agents by calling
 * them as tools. Each sub-agent is a full agent wrapped in a tool function —
 * the supervisor decides which to call, in what order, and how to combine results.
 *
 * KEY CHARACTERISTIC: Sub-agents are STATELESS. Every invocation starts with
 * a clean context. The supervisor is the only agent that holds the full
 * conversation history across turns.
 *
 * Compare to other patterns:
 *   Handoffs  (3.3.2) — one agent transitions between roles via state; sequential flow
 *   Skills    (3.3.3) — one agent loads specialized prompts on-demand; no fixed order
 *   Router    (3.3.4) — a preprocessing step classifies the query, then hands off once
 *
 * When to use this pattern:
 *   - You have multiple distinct domains (research, writing, fact-checking, etc.)
 *   - Sub-agents don't need to converse directly with the user
 *   - You want centralized workflow control with a fixed pipeline
 */

import { createAgent, initChatModel, tool } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import z from "zod";
import {TavilySearch} from "@langchain/tavily";

const model = await initChatModel("gpt-4o");

// ---------------------------------------------------------------------------
// Sub-agent tools — real tools that sub-agents can use
// ---------------------------------------------------------------------------

const searchWeb = new TavilySearch({ maxResults: 3, name: "search_web" });
const factCheckWeb = new TavilySearch({ maxResults: 2, name: "fact_check_web" });

// ---------------------------------------------------------------------------
// Sub-agents — each is a focused specialist with a narrow system prompt.
// Note: these are private (_prefix). The supervisor calls them via wrapper tools.
// ---------------------------------------------------------------------------

const _researchAgent = createAgent({
  model,
  tools: [searchWeb],
  systemPrompt:
    "You are a research specialist. Search the web and gather thorough " +
    "information on the given topic. Always include your findings in your " +
    "final response — the supervisor only sees your last message.",
});

const _summaryAgent = createAgent({
  model,
  systemPrompt:
    "You are a summarization expert. Condense the provided research into " +
    "clear, concise bullet-point key findings. Return only the summary.",
});

const _writerAgent = createAgent({
  model,
  systemPrompt:
    "You are a professional report writer. Given a topic and key findings, " +
    "produce a well-structured markdown report with an introduction, key " +
    "findings section, and a conclusion. Return the full report text.",
});

const _factCheckerAgent = createAgent({
  model,
  tools: [factCheckWeb],
  systemPrompt:
    "You are a fact-checker. Verify the main claims in the provided report " +
    "using authoritative web sources. Return a verdict for each claim " +
    "(Verified / Unverified / False) with a brief explanation.",
});

// ---------------------------------------------------------------------------
// Sub-agents wrapped as tools — this is the core of the supervisor pattern.
// The supervisor calls these like any other tool. Each wrapper:
//   1. Invokes the sub-agent with the given input as a fresh HumanMessage
//   2. Returns only the last message content (the sub-agent's final answer)
// The supervisor never sees the sub-agent's internal reasoning or tool calls.
// ---------------------------------------------------------------------------

const callResearcher = tool(
  async ({ query }) => {
    const result = await _researchAgent.invoke({
      messages: [new HumanMessage(query)],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "researcher",
    description: "Research a topic on the web and return detailed findings.",
    schema: z.object({ query: z.string() }),
  }
);

const callSummarizer = tool(
  async ({ research }) => {
    const result = await _summaryAgent.invoke({
      messages: [new HumanMessage(research)],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "summarizer",
    description: "Summarize research findings into concise key points.",
    schema: z.object({ research: z.string() }),
  }
);

const callWriter = tool(
  async ({ topic, keyFindings }) => {
    const prompt = `Topic: ${topic}\n\nKey findings:\n${keyFindings}`;
    const result = await _writerAgent.invoke({
      messages: [new HumanMessage(prompt)],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "writer",
    description: "Write a structured report given a topic and key findings.",
    schema: z.object({ topic: z.string(), keyFindings: z.string() }),
  }
);

const callFactChecker = tool(
  async ({ report }) => {
    const result = await _factCheckerAgent.invoke({
      messages: [new HumanMessage(report)],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "fact_checker",
    description: "Fact-check the claims in a report and return a verdict.",
    schema: z.object({ report: z.string() }),
  }
);

// ---------------------------------------------------------------------------
// Supervisor (main agent) — orchestrates the full research-to-report pipeline.
// It sees the user's request, decides which tools to call and in what order,
// and synthesizes the final answer. Sub-agents never interact with the user.
// ---------------------------------------------------------------------------

const SUPERVISOR_PROMPT = `
You are a supervisor orchestrating a research and report pipeline.
You have four specialist sub-agents available as tools:

- researcher    — searches the web and gathers detailed information on a topic
- summarizer    — condenses raw research into concise key points
- writer        — writes a structured markdown report from key findings
- fact_checker  — verifies the accuracy of claims in the final report

Follow this pipeline for every request:
1. Call researcher to gather information
2. Call summarizer with the research output
3. Call writer with the topic and key findings
4. Call fact_checker with the final report
5. Return the completed, fact-checked report to the user
`.trim();

export const supervisorAgent = createAgent({
  model,
  tools: [callResearcher, callSummarizer, callWriter, callFactChecker],
  systemPrompt: SUPERVISOR_PROMPT,
});
