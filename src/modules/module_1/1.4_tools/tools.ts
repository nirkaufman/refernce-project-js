import {createAgent} from "langchain";
import {ChatOpenAI} from "@langchain/openai";
import {systemPrompt} from "./promps/system-prompt.js";
import {searchRecipeDatabase} from "./tools/serach-recipe.js";
import {saveRecipeToDatabase} from "./tools/save-recipe.js";
import {RecipeSchema} from "./schemas/recipe.schema.js";

// Instantiate the model
const model = new ChatOpenAI({
  model: "gpt-5.1",
  temperature: 0.5,
  maxTokens: 1500,
  maxRetries: 3,
});

// Create the agent with tools
export const simpleToolsAgent = createAgent({
  model,
  systemPrompt,
  tools: [searchRecipeDatabase, saveRecipeToDatabase],
  responseFormat: RecipeSchema,
});
