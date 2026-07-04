import { createAgent, tool } from "langchain";
import z from "zod";
import { creativeModel } from "../models.js";
import { saveMarkdown, readMarkdown } from "../tools/save-markdown.js";

/**
 * SKILLS PATTERN — one agent, on-demand expertise.
 * Each skill is a rich platform-specific prompt. The agent loads the one
 * it needs via load_skill ("progressive disclosure"). Adding a platform
 * later = adding an entry here. No new agents, no new wiring.
 */
const SKILLS: Record<string, string> = {
  linkedin_post: `
    You are a LinkedIn content expert. Rules for a great teaser post:
    - Hook in the FIRST line — a bold claim or surprising fact from the article.
      (LinkedIn truncates after ~2 lines; the hook decides everything.)
    - 3-5 short paragraphs, one idea each. Generous line breaks.
    - Professional but human tone; no hype words ("game-changer", "🚀 excited").
    - One concrete insight from the article — give value before the ask.
    - End with a question to spark comments, then "Link in comments 👇".
    - 3-5 niche hashtags at the end (not #technology — too broad).
  `.trim(),

  x_thread: `
    You are an X (Twitter) thread expert. Rules:
    - Tweet 1 is the hook: bold statement, under 200 chars, no hashtags.
    - 4-6 tweets, each self-contained, numbered "2/", "3/"...
    - Final tweet: summary + link placeholder.
  `.trim(),
};

const loadSkill = tool(
  ({ skillName }) => {
    const skill = SKILLS[skillName];
    if (!skill) {
      return `Unknown skill '${skillName}'. Available: ${Object.keys(SKILLS).join(", ")}`;
    }
    return skill;
  },
  {
    name: "load_skill",
    description:
      "Load platform-specific social media expertise. " +
      `Available skills: ${Object.keys(SKILLS).join(", ")}.`,
    schema: z.object({
      skillName: z.string().describe("Name of the skill to load"),
    }),
  }
);

const SOCIAL_PROMPT = `
You are a social media manager promoting technical articles.

## Your task
1. Read the article using read_markdown ("article.md").
2. Load the right platform skill with load_skill (default: linkedin_post).
3. Write the post following the loaded skill's rules exactly.
4. Save it with save_markdown as "linkedin-post.md" with this structure:
   # LinkedIn Teaser
   ## Post              (the ready-to-publish post text)
   ## Best Time to Post (one-line suggestion)

## Constraints
- Base the post on the article's actual content — quote real insights.
- After saving, reply with just the hook line of the post.
`.trim();

export const socialAgent = createAgent({
  model: creativeModel,
  tools: [readMarkdown, loadSkill, saveMarkdown],
  systemPrompt: SOCIAL_PROMPT,
});
