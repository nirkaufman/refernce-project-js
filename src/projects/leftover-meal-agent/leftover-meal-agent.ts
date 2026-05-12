import { createAgent } from "langchain";
import { ChatOpenAI } from "@langchain/openai";
import { TavilySearch } from "@langchain/tavily";
// import { MemorySaver } from "@langchain/langgraph";


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
