// from langchain.chat_models import init_chat_model
// from langchain.agents import create_agent
// from pydantic import BaseModel
//
// model= init_chat_model(model='gpt-5-nano')
//
// personal_chef_prompt = """
//     You are a personal chef assistant.
//     Your task is to provide personalized meal recommendations based on user
//     Ingredients and preferences.
//     Generate only one recipe.
// """
//
// class Recipe(BaseModel):
//     name: str
//     ingredients: list[str]
//     instructions: str

import {createAgent, initChatModel} from "langchain";
import z from "zod";

const model = await initChatModel('gpt-5-nano');


const personalChefPrompt =`
    You are a personal chef assistant. 
    Your task is to provide personalized meal recommendations based on user 
    Ingredients and preferences. 
    Generate only one recipe.
`

const recipeSchema = z.object({
  name: z.string(),
  ingredients: z.array(z.string()),
  instructions: z.string(),
})


export const structure = createAgent({
  model,
  systemPrompt: personalChefPrompt,
  responseFormat: recipeSchema
})
