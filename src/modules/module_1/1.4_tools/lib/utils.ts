import * as fs from "fs";
import * as path from "path";
import { fileURLToPath } from "url";
import {z} from "zod";
import {RecipeItemSchema} from "../schemas/recipe-item.schema.js";

// Path to the recipe database
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DB_PATH = path.join(__dirname, "recipes-db.json");


// Helper function to read the database
export function readDatabase(): { recipes: z.infer<typeof RecipeItemSchema>[] } {
  const data = fs.readFileSync(DB_PATH, "utf-8");
  return JSON.parse(data);
}

// Helper function to write to the database
export function writeDatabase(data: { recipes: z.infer<typeof RecipeItemSchema>[] }): void {
  fs.writeFileSync(DB_PATH, JSON.stringify(data, null, 2), "utf-8");
}

// Helper function for fuzzy name matching
export function fuzzyMatch(searchTerm: string, targetName: string): boolean {
  const search = searchTerm.toLowerCase().trim();
  const target = targetName.toLowerCase();

  // Exact match
  if (target.includes(search)) return true;

  // Word-by-word match (any word matches)
  const searchWords = search.split(/\s+/);
  const targetWords = target.split(/\s+/);

  return searchWords.some(sw =>
      targetWords.some(tw => tw.includes(sw) || sw.includes(tw))
  );
}
