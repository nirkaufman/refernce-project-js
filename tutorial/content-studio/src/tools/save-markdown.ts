import { tool } from "langchain";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import z from "zod";

const OUTPUT_DIR = "output";

/**
 * Custom tool: saves markdown content to the output/ folder.
 * The Zod schema is converted to a spec the model reads — every
 * .describe() is documentation for the AI, not just validation.
 */
export const saveMarkdown = tool(
  async ({ filename, content }) => {
    await mkdir(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, filename);
    await writeFile(filePath, content, "utf-8");
    return `Saved ${content.length} characters to ${filePath}`;
  },
  {
    name: "save_markdown",
    description:
      "Save markdown content to a file in the output folder. " +
      "Use this to persist your final work product.",
    schema: z.object({
      filename: z
        .string()
        .describe("File name including the .md extension, e.g. 'research.md'"),
      content: z.string().describe("The full markdown content to save"),
    }),
  }
);

export const readMarkdown = tool(
  async ({ filename }) => {
    const filePath = path.join(OUTPUT_DIR, filename);
    return await readFile(filePath, "utf-8");
  },
  {
    name: "read_markdown",
    description:
      "Read a markdown file from the output folder. " +
      "Use this to load work produced by previous steps.",
    schema: z.object({
      filename: z.string().describe("File name to read, e.g. 'research.md'"),
    }),
  }
);
