import { createAgent, createMiddleware, initChatModel } from "langchain";

const simpleModel = await initChatModel('gpt-5-nano');
const complexModel = await initChatModel('gpt-4o');

const stateBasedModel = createMiddleware({
  name: "StateBasedModel",
  wrapModelCall: (request, handler) => {
    let chosenModel;

    if (request.messages.length > 5) {
      chosenModel = complexModel;
      console.log("Using complex model");
    } else {
      chosenModel = simpleModel;
      console.log("Using simple model");
    }

    return handler({ ...request, model: chosenModel });
  },
});

export const stateModel = createAgent({
  model: simpleModel,
  middleware: [stateBasedModel],
});
