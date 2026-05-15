/**
 * SKILLS PATTERN — Coding assistant with on-demand specializations
 * ----------------------------------------------------------------
 * ONE agent that loads specialized prompts ("skills") on demand.
 * The agent starts with a lightweight base prompt. When a user request
 * requires domain expertise, the agent calls `loadSkill` to fetch a rich,
 * focused prompt and injects it into its reasoning for that turn.
 *
 * This is "progressive disclosure" — domain knowledge enters the context only
 * when needed, keeping the base context window small and focused.
 *
 * Compare to other patterns:
 *   Supervisor (3.3.1) — many sub-agents; each is a separate agent instance
 *   Handoffs   (3.3.2) — one agent; enforces a sequential step order via state
 *   Router     (3.3.4) — classifies upfront and routes to a dedicated agent node
 *
 * When to use this pattern:
 *   - One agent with many possible specializations
 *   - No enforced order between skills — the agent chooses what to load
 *   - Different teams can develop and maintain skills independently
 *   - You want to keep the base context small (load only what's needed)
 *
 * Skills in this demo:
 *   - write_sql   : SQL query expert
 *   - review_code : Code reviewer (bugs, security, performance)
 *   - write_tests : Test author (pytest / vitest)
 */

import { createAgent, initChatModel, tool } from "langchain";
import z from "zod";

// ---------------------------------------------------------------------------
// Skill registry — each skill is a focused prompt defining a specialization.
// In a real system these could be loaded from files, a database, or an API.
// ---------------------------------------------------------------------------

const SKILLS: Record<string, string> = {
  write_sql: `
    You are an expert SQL query author.
    Guidelines:
    - Prefer CTEs over nested subqueries for readability.
    - Always alias tables and columns clearly.
    - Add brief inline comments for non-obvious logic.
    - Use ANSI SQL unless the user specifies a dialect (PostgreSQL, MySQL, etc.).
    - Point out missing indexes or performance pitfalls when relevant.
    Always return the final SQL in a fenced \`\`\`sql block.
  `.trim(),

  review_code: `
    You are an expert code reviewer focused on correctness, clarity, and security.
    When reviewing code:
    1. Identify bugs or logic errors first.
    2. Flag security issues (injection, secrets in code, unsafe deserialization).
    3. Note performance concerns (N+1 queries, unnecessary allocations).
    4. Suggest readability improvements (naming, structure, comments).
    5. Praise what is done well — reviews should be constructive.
    Structure your response as: Summary → Issues → Suggestions → Verdict.
  `.trim(),

  write_tests: `
    You are an expert test author using pytest / vitest.
    When writing tests:
    - Cover the happy path, edge cases, and error paths.
    - Use descriptive test names: test_<function>_<scenario>_<expected>.
    - Prefer fixtures over setUp/tearDown.
    - Mock only external I/O (network, disk, time) — never internal logic.
    - Add a one-line docstring to each test explaining what it verifies.
    Always return complete, runnable test files.
  `.trim(),
};

// ---------------------------------------------------------------------------
// loadSkill tool — the single entry point for progressive disclosure.
// The agent calls this when it determines a skill is needed; the returned
// prompt is injected into the agent's context for that turn.
// ---------------------------------------------------------------------------

const loadSkill = tool(
  ({ skillName }) => {
    const skill = SKILLS[skillName];
    if (!skill) {
      const available = Object.keys(SKILLS).join(", ");
      return `Unknown skill '${skillName}'. Available: ${available}`;
    }
    return skill;
  },
  {
    name: "load_skill",
    description: `Load a specialized skill prompt on-demand.

    Available skills:
    - write_sql   : Expert SQL query author
    - review_code : Expert code reviewer (bugs, security, performance)
    - write_tests : Expert test author (pytest / vitest)
    
    Returns the skill's full prompt and domain guidelines.`,
    schema: z.object({ skillName: z.string().describe("Name of the skill to load") }),
  }
);

// ---------------------------------------------------------------------------
// Agent — starts lightweight; skills expand its knowledge on-demand.
// The system prompt lists available skills so the agent knows when to load one.
// ---------------------------------------------------------------------------

const model = await initChatModel("gpt-4o");

export const skillsAgent = createAgent({
  model,
  tools: [loadSkill],
  systemPrompt:
    "You are a coding assistant with access to specialized skills. " +
    "Available skills: write_sql, review_code, write_tests. " +
    "When the user's request falls within a skill's domain, call load_skill " +
    "first to load the relevant expertise, then complete the task using those guidelines. " +
    "For general questions, answer directly without loading a skill.",
});
