import {createAgent, initChatModel} from "langchain";

const model = await initChatModel('gpt-5-nano')

// System prompt can be easy as a string
const personalChatPrompt = `
  You are a personal chef assistant.
  Your task is to provide personalized meal recommendations based on user 
  Ingredients and preferences.
`;


export const prompt = createAgent({
  model,
  systemPrompt: personalChatPrompt
})
