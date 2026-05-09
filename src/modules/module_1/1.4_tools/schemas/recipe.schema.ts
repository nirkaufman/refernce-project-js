import {z} from "zod";
import {RecipeItemSchema} from "./recipe-item.schema.js";

export const RecipeSchema = z.object({
  // Initial reaction
  initialReaction: z
      .string()
      .describe("Chef's enthusiastic 1-2 sentence reaction to the ingredients provided"),

  // Recipe ideas
  recipeIdeas: z
      .array(z.object({
        name: z.string().describe("Recipe name"),
        whyItWorks: z.string().describe("Brief explanation of why this recipe works with the provided ingredients"),
        isTopPick: z.boolean().describe("Whether this is the recommended top pick"),
      }))
      .min(1)
      .max(3)
      .describe("1-3 recipe options ranked by how well they use the provided ingredients"),

  // The detailed top pick recipe
  topPick: RecipeItemSchema,

  // Source indicator
  source: z
      .enum(["database", "freshly_created"])
      .describe("Whether this recipe came from the database or was freshly created"),
});
