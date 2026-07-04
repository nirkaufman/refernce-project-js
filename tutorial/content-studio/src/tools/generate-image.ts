import { tool } from "langchain";
import OpenAI from "openai";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import z from "zod";

const openai = new OpenAI(); // reads OPENAI_API_KEY from env
const OUTPUT_DIR = "output";

/**
 * Custom tool wrapping the OpenAI Images API.
 * Any external API becomes agent-usable with tool() + a clear schema.
 */
export const generateImage = tool(
  async ({ prompt, filename }) => {
    const response = await openai.images.generate({
      model: "gpt-image-1",
      prompt,
      size: "1536x1024", // landscape — good for article covers
    });

    const b64 = response.data?.[0]?.b64_json;
    if (!b64) return "Image generation failed: no image data returned.";

    await mkdir(OUTPUT_DIR, { recursive: true });
    const filePath = path.join(OUTPUT_DIR, filename);
    await writeFile(filePath, Buffer.from(b64, "base64"));
    return `Image saved to ${filePath}`;
  },
  {
    name: "generate_image",
    description:
      "Generate an image from a text prompt using an AI image model " +
      "and save it as a PNG file in the output folder.",
    schema: z.object({
      prompt: z
        .string()
        .describe(
          "Detailed visual description: subject, style, mood, colors, composition"
        ),
      filename: z
        .string()
        .describe("File name with .png extension, e.g. 'cover.png'"),
    }),
  }
);
