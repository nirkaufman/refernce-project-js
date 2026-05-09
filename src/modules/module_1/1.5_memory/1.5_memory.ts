import { createAgent, tool, initChatModel, type ToolRuntime } from "langchain";
import { StateSchema } from "@langchain/langgraph";
import z from "zod";

const model = await initChatModel("gpt-5-nano");

// CustomState extends the built-in agent state with a user_name field.
// StateSchema is the TypeScript equivalent of Python's AgentState subclass.
const CustomState = new StateSchema({
  user_name: z.string().optional(),
});

const greetUser = tool(
  // runtime.state gives access to the full agent state, including custom fields.
  async (_, runtime: ToolRuntime<typeof CustomState.State>) => {
    const userName = runtime.state.user_name ?? null;
    return `The user name is: ${userName}!`;
  },
  {
    name: "greet_user",
    description: "Greet the user by name.",
    schema: z.object({}),
  },
);

const personalChefPrompt = `
    You are a personal chef assistant.
    Your task is to provide personalized meal recommendations based on user
    Ingredients and preferences.
    Greet the user personally by his name.
`;

// Putting it all together
export const memory = createAgent({
  model,
  systemPrompt: personalChefPrompt,
  tools: [greetUser],
  stateSchema: CustomState,
});
