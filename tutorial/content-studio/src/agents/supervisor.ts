import { createAgent, tool } from "langchain";
import { HumanMessage } from "@langchain/core/messages";
import z from "zod";
import { model } from "../models.js";
import { researchAgent } from "./research-agent.js";
import { writerAgent } from "./writer-agent.js";
import { factCheckerAgent } from "./fact-checker-agent.js";
import { imageAgent } from "./image-agent.js";
import { socialAgent } from "./social-agent.js";

/**
 * SUB-AGENTS AS TOOLS (supervisor pattern)
 * ----------------------------------------
 * Each wrapper: (1) invokes the sub-agent with a fresh HumanMessage,
 * (2) returns only the last message — the sub-agent's final answer.
 * Sub-agents are STATELESS: every call starts with a clean context.
 * The supervisor is the only agent holding the full conversation.
 */

const runResearcher = tool(
  async ({ topic }) => {
    console.log("  🔎 Research agent working...");
    const result = await researchAgent.invoke({
      messages: [new HumanMessage(`Research this topic: ${topic}`)],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "run_researcher",
    description:
      "Research a topic on the web and save a research brief to research.md. " +
      "Returns a summary of the findings.",
    schema: z.object({ topic: z.string().describe("The topic to research") }),
  }
);

const runWriter = tool(
  async ({ topic }) => {
    console.log("  ✍️  Writer agent working...");
    const result = await writerAgent.invoke({
      messages: [
        new HumanMessage(
          `Write the article about "${topic}" based on research.md.`
        ),
      ],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "run_writer",
    description:
      "Write a technical article from research.md and save it to article.md. " +
      "Requires run_researcher to have completed first.",
    schema: z.object({ topic: z.string().describe("The article topic") }),
  }
);

const runFactChecker = tool(
  async () => {
    console.log("  ✅ Fact-checker agent working...");
    const result = await factCheckerAgent.invoke({
      messages: [new HumanMessage("Fact-check the article in article.md.")],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "run_fact_checker",
    description:
      "Verify the claims in article.md and save a report to fact-check.md. " +
      "Requires run_writer to have completed first. Returns the verdict summary.",
    schema: z.object({}),
  }
);

const runImageCreator = tool(
  async () => {
    console.log("  🎨 Image agent working...");
    const result = await imageAgent.invoke({
      messages: [new HumanMessage("Create the cover image for article.md.")],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "run_image_creator",
    description:
      "Create a cover image for article.md; saves cover.png and cover.md. " +
      "Requires run_writer to have completed first.",
    schema: z.object({}),
  }
);

const runSocialMedia = tool(
  async () => {
    console.log("  📣 Social media agent working...");
    const result = await socialAgent.invoke({
      messages: [new HumanMessage("Create a LinkedIn teaser for article.md.")],
    });
    return result.messages.at(-1)?.content as string;
  },
  {
    name: "run_social_media",
    description:
      "Write a LinkedIn teaser post for article.md; saves linkedin-post.md. " +
      "Requires run_writer to have completed first.",
    schema: z.object({}),
  }
);

const SUPERVISOR_PROMPT = `
You are the editor-in-chief of a content studio, orchestrating a team
of specialist agents to produce a complete content package.

Your team (available as tools):
- run_researcher    — researches a topic, saves research.md
- run_writer        — writes the article, saves article.md
- run_fact_checker  — verifies the article, saves fact-check.md
- run_image_creator — creates a cover image, saves cover.png + cover.md
- run_social_media  — writes a LinkedIn teaser, saves linkedin-post.md

For every topic, run this pipeline IN ORDER:
1. run_researcher with the topic
2. run_writer with the topic
3. run_fact_checker
4. run_image_creator
5. run_social_media
6. Report to the user: article title, fact-check verdict, image concept,
   the post's hook line, and the full list of files produced.

Never skip a step. Never create content yourself — delegate everything.
If the fact-checker reports any FALSE claims, mention them prominently
in your final report so a human can review before publishing.
`.trim();

export const supervisor = createAgent({
  model,
  tools: [
    runResearcher,
    runWriter,
    runFactChecker,
    runImageCreator,
    runSocialMedia,
  ],
  systemPrompt: SUPERVISOR_PROMPT,
});
