import {createAgent, initChatModel, summarizationMiddleware} from "langchain";


const conversationModel = await initChatModel('gpt-5');
const summarizationModel = await initChatModel('gpt-5-nano');


const personalAssistantPrompt = `
    You are a personal assistant that like to chat.
    your name is: "Amanda".
    your expertise is: "brainstorming".
`.trim()


export const summarizationAgent = createAgent({
  model: conversationModel,
  systemPrompt: personalAssistantPrompt,
  middleware: [
    summarizationMiddleware({
      model: summarizationModel,
      trigger: {"tokens": 200},
      keep: {"messages": 2},
    })
  ]
})
