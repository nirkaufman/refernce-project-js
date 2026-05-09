import { createAgent, createMiddleware, initChatModel, AIMessage } from "langchain";

const bannedKeywords = ["hack", "exploit", "malware"];

// Deterministic guardrail: Block requests containing banned keywords.
const contentFilter = createMiddleware({
  name: "ContentFilter",
  beforeAgent: {
    canJumpTo: ["end"],
    hook: (state) => {
      if (!state.messages || state.messages.length === 0) return;

      const firstMessage = state.messages[0];
      if (firstMessage._getType() !== "human") return;

      const content = firstMessage.content.toString().toLowerCase();

      for (const keyword of bannedKeywords) {
        if (content.includes(keyword)) {
          return {
            messages: [new AIMessage("I cannot process requests containing inappropriate content. Please rephrase your request.")],
            jumpTo: "end" as const,
          };
        }
      }
      return;
    },
  },
});

const model = await initChatModel('gpt-5-nano');

export const keywordGuardrail = createAgent({
  model,
  systemPrompt: "You are a helpful assistant named: Anna.",
  tools: [],
  middleware: [contentFilter],
});
