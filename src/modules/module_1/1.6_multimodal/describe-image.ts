import { ChatOpenAI } from "@langchain/openai";
import {createAgent} from "langchain";

// Use a vision-capable model
const model = new ChatOpenAI({
  model: "gpt-4o",
  maxTokens: 500,
});


export const describeImage = createAgent({
  model,
  systemPrompt: 'you are an image descriptor. describe the image'
})
