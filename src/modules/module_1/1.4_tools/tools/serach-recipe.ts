import { tool } from "langchain";
import {RecipeItemSchema} from "../schemas/recipe-item.schema.js";
import {fuzzyMatch, readDatabase} from "../lib/utils.js";
import {z} from "zod";

export const searchRecipeDatabase = tool(
    ({ ingredients, recipeName }) => {
      const db = readDatabase();
      const results: z.infer<typeof RecipeItemSchema>[] = [];

      for (const recipe of db.recipes) {
        // Match by recipe name
        if (recipeName.length > 0 && fuzzyMatch(recipeName, recipe.name)) {
          results.push(recipe);
          continue;
        }

        // Match by ingredients
        if (ingredients.length > 0) {
          const recipeText = `${recipe.name} ${recipe.additionalIngredients.join(" ")}`.toLowerCase();
          const matchCount = ingredients.filter(ing =>
              recipeText.includes(ing.toLowerCase())
          ).length;

          // If at least half the ingredients match, include it
          if (matchCount >= Math.ceil(ingredients.length / 2)) {
            results.push(recipe);
          }
        }
      }

      if (results.length === 0) {
        return JSON.stringify({ found: false, message: "No matching recipes found in database." });
      }

      return JSON.stringify({
        found: true,
        count: results.length,
        recipes: results
      });
    },
    {
      name: "search_recipe_database",
      description: "Search the recipe database by ingredients or recipe name. Use this BEFORE creating a new recipe to check if we already have something suitable.",
      schema: z.object({
        ingredients: z.array(z.string()).default([]).describe("List of ingredients to search for"),
        recipeName: z.string().default("").describe("Name of a specific recipe to search for"),
      }),
    }
);
