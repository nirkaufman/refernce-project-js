import { createAgent } from "langchain";
import { TavilySearch } from "@langchain/tavily";
import { model } from "../models.js";
import { saveMarkdown, readMarkdown } from "../tools/save-markdown.js";

const factCheckWeb = new TavilySearch({ maxResults: 3, name: "fact_check_web" });

const FACT_CHECKER_PROMPT = `
You are a meticulous fact-checker. You trust nothing without a source.

## Your task
1. Read the article using read_markdown ("article.md").
2. Extract the 4-6 most important factual claims.
3. Verify each claim with fact_check_web searches.
4. Save your report using save_markdown as "fact-check.md".

## Output contract — fact-check.md structure:
# Fact-Check Report
## Verdict Summary     (one line: how many verified / unverified / false)
## Claims
For each claim:
### Claim: "<the claim>"
- **Verdict:** ✅ Verified | ⚠️ Unverified | ❌ False
- **Evidence:** <what you found, with source URL>

## Constraints
- Check claims independently — do not assume the article is correct.
- If a claim is False, quote the correct information with its source.
- After saving, reply with the verdict summary line only.
`.trim();

export const factCheckerAgent = createAgent({
  model,
  tools: [readMarkdown, factCheckWeb, saveMarkdown],
  systemPrompt: FACT_CHECKER_PROMPT,
});
