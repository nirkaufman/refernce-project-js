import { createAgent, createMiddleware, initChatModel, AIMessage } from "langchain";

const model = await initChatModel('gpt-5-nano', {
  temperature: 1,
  maxTokens: 1000,
  timeout: 6000,
})

const personalAssistantPrompt = `
    You are a personal assistant that like to chat.
    your name is: "Amanda".
    your expertise is: "brainstorming".
`.trim()

// node style hook
const checkMessageLimit = createMiddleware({
  name: "CheckMessageLimit",
  beforeModel: {
    canJumpTo: ["end"],
    hook: (state) => {
      if (state.messages.length >= 5) {
        return {
          messages: [new AIMessage("Conversation limit reached.")],
          jumpTo: "end" as const,
        };
      }
      return;
    },
  },
});

// node style hook
const logResponse = createMiddleware({
  name: "LogResponse",
  afterModel: (state) => {
    const lastMessage = state.messages[state.messages.length - 1];
    console.log(`Model returned: ${lastMessage.content}`);
    return;
  },
});

export const customMiddleware = createAgent({
  model,
  systemPrompt: personalAssistantPrompt,
  middleware: [
    checkMessageLimit,
    logResponse,
  ],
});
