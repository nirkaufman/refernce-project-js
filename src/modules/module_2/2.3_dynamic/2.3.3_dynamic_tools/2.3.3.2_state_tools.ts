import { createAgent, createMiddleware, initChatModel, tool } from "langchain";
import { MessagesValue, StateSchema } from "@langchain/langgraph";
import z from "zod";

const publicSearch = tool(
  ({ query }) => `public searching for '${query}'...`,
  {
    name: "public_search",
    description: "public search function",
    schema: z.object({ query: z.string() }),
  }
);

const advancedSearch = tool(
  ({ query }) => `advanced searching for '${query}'...`,
  {
    name: "advanced_search",
    description: "advanced search function",
    schema: z.object({ query: z.string() }),
  }
);

const stateBasedTools = createMiddleware({
  name: "StateBasedTools",
  wrapModelCall: (request, handler) => {
    const state = request.state as { authenticated?: boolean; messages: unknown[] };
    const isAuthenticated = state.authenticated ?? false;
    const messageCount = state.messages.length;

    let tools = request.tools;

    if (!isAuthenticated) {
      tools = request.tools.filter((t) => (t.name as string).startsWith("public_"));
    } else if (messageCount < 5) {
      tools = request.tools.filter((t) => t.name !== "advanced_search");
    }

    return handler({ ...request, tools });
  },
});

const CustomState = new StateSchema({
  messages: MessagesValue,
  authenticated: z.boolean(),
});

const model = await initChatModel('gpt-5-nano');

export const stateTools = createAgent({
  model,
  tools: [publicSearch, advancedSearch],
  stateSchema: CustomState,
  middleware: [stateBasedTools],
});
