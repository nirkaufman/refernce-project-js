import { createAgent, dynamicSystemPromptMiddleware, initChatModel } from "langchain";
import z from "zod";

const model = await initChatModel('gpt-5-nano');

const contextSchema = z.object({
  userRole: z.string(),
  deploymentEnv: z.string(),
});

type Context = z.infer<typeof contextSchema>;

const runtimeAwarePrompt = dynamicSystemPromptMiddleware<Context>((_state, runtime) => {
  const userRole = runtime.context.userRole;
  const env = runtime.context.deploymentEnv;

  let base = "You are a helpful assistant.";

  if (userRole === "admin") {
    base += "\nYou have admin access. You can perform all operations. greet the user and let them know that you are an admin.";
  } else if (userRole === "viewer") {
    base += "\nYou have read-only access. Guide users to read operations only. Let the user know that you are a viewer.";
  }

  if (env === "production") {
    base += "\nBe extra careful with any data modifications. let the user know that you are in production.";
  }

  return base.trim();
});

export const runtimePrompt = createAgent({
  model,
  tools: [],
  contextSchema,
  middleware: [runtimeAwarePrompt],
});
