import { createAgent, dynamicSystemPromptMiddleware, initChatModel } from "langchain";

const model = await initChatModel('gpt-5-nano');

const stateAwarePrompt = dynamicSystemPromptMiddleware((state) => {
  const messageCount = state.messages.length;

  let base = "You are a helpful assistant.";

  if (messageCount > 3) {
    base += "\nThis is a long conversation - be extra concise - and let the user know that you are in a long conversation.";
  }

  return base;
});

export const statePrompt = createAgent({
  model,
  middleware: [stateAwarePrompt],
});
