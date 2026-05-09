// import * as fs from 'fs';
// import * as path from 'path';
import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
// import { MemorySaver } from "@langchain/langgraph";
import { TavilySearch } from "@langchain/tavily";
// import { HumanMessage } from "@langchain/core/messages";

// Initialize TavilySearch tool for web search
const webSearch = new TavilySearch({
  maxResults: 3,
});

// System prompt for the personal chef assistant
const systemPrompt = `
You are a creative personal chef assistant. Your job is to:
  1. Analyze images of ingredients the user shows you
  2. Search the web for recipes that use those ingredients
  3. Suggest practical, delicious meals they can make

When you see an image:
  - First identify all visible ingredients
  - Search for recipes using those ingredients
  - Recommend the best recipe with clear instructions

  Be friendly, encouraging, and practical. Focus on simple meals that 
  minimize food waste.
`.trim();

// Use a vision-capable model
const model = new ChatOpenAI({
  model: "gpt-4o",
  temperature: 0.7,
  maxTokens: 1500,
});

// Create a memory checkpointer for conversation persistence
// const checkpointer = new MemorySaver();

// Create the agent with tools and memory
export const leftoverMealAgent = createAgent({
  model,
  // checkpointer,
  systemPrompt,
  tools: [webSearch],
});

// Demo invocation - only runs when executed directly via CLI
// Run with: npx tsx src/4-leftover-meal-agent/leftover-meal-agent.ts
// if (process.argv[1]?.includes('leftover-meal-agent')) {
//   const imagePath = path.join(import.meta.dirname, 'assets', 'ingredients.jpg');
//   const imageData = fs.readFileSync(imagePath);
//   const base64Image = imageData.toString('base64');
//
//   const message = new HumanMessage({
//     content: [
//       { type: "text", text: "Here's what I have in my fridge. What can I make?" },
//       {
//         type: "image_url",
//         image_url: {
//           url: `data:image/jpeg;base64,${base64Image}`,
//         },
//       },
//     ],
//   });
//
//   const response = await agent.invoke(
//     { messages: [message] },
//     { configurable: { thread_id: "leftover-demo-1" } }
//   );
//
//   const lastMessage = response.messages[response.messages.length - 1];
//   console.log("Chef:", lastMessage.content);
// }
