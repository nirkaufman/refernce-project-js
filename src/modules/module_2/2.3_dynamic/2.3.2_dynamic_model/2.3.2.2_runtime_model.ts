import { createAgent, createMiddleware, initChatModel } from "langchain";
import z from "zod";

const premiumModel = await initChatModel('gpt-5');
const standardModel = await initChatModel('gpt-4o');
const budgetModel = await initChatModel('gpt-4-mini');

const contextSchema = z.object({
  costTier: z.string(),
  environment: z.string(),
});

type Context = z.infer<typeof contextSchema>;

const contextBasedModel = createMiddleware({
  name: "ContextBasedModel",
  wrapModelCall: (request, handler) => {
    const { costTier, environment } = request.runtime.context as Context;

    let model;

    if (environment === "production" && costTier === "premium") {
      model = premiumModel;
    } else if (costTier === "budget") {
      model = budgetModel;
    } else {
      model = standardModel;
    }

    return handler({ ...request, model });
  },
});

export const runtimeModel = createAgent({
  model: budgetModel,
  tools: [],
  contextSchema,
  middleware: [contextBasedModel],
});
