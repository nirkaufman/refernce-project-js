import { createAgent, dynamicSystemPromptMiddleware, initChatModel } from "langchain";
import { InMemoryStore } from "@langchain/langgraph";
import z from "zod";

const model = await initChatModel('gpt-5-nano');

const contextSchema = z.object({
  userId: z.string(),
});

type Context = z.infer<typeof contextSchema>;

const storeAwarePrompt = dynamicSystemPromptMiddleware<Context>(async (_state, runtime) => {
  const userId = runtime.context.userId;
  const store = runtime.store as InMemoryStore;
  const userPrefs = await store?.get(["preferences"], userId);

  let base = "You are a helpful assistant.";

  if (userPrefs) {
    const style = (userPrefs.value as Record<string, string>).communication_style ?? "balanced";
    base += `\nUser prefers ${style} responses.`;
  } else {
    base += "User prefers angry responses.";
  }

  return base;
});

// store is commented out since langGraph server handles it internally
export const storePrompt = createAgent({
  model,
  contextSchema,
  middleware: [storeAwarePrompt],
  // store: new InMemoryStore(),
});
