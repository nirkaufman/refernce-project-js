# Exercise 3: The Skills Pattern

**Architecture:** Progressive Disclosure via On-Demand Skill Prompts
**Estimated time:** 25–35 minutes
**Reference:** `src/modules/module_3/3.3_multi_agent/3.3.3_skills/3.3.3_skills.ts`

---

## What You'll Build

A **personal finance advisor** — a single agent that stays lightweight by default and loads deep domain expertise only when the user's question demands it.

The advisor has three skills it can load on demand:

| Skill name | Activated when the user asks about... |
|---|---|
| `budget_analysis` | spending categories, monthly budget, where money is going |
| `investment_advice` | stocks, ETFs, index funds, retirement, portfolio allocation |
| `debt_management` | paying off loans, credit cards, debt snowball/avalanche strategies |

For general financial questions ("is saving 10% enough?") the agent answers from its base knowledge without loading any skill. For specialized questions, it calls `loadSkill` first, reads the returned prompt, then answers with domain-specific depth.

---

## Architecture Diagram

```
User question
      │
      ▼
┌────────────────────────────┐
│    Finance Advisor Agent   │
│                            │
│  Base prompt:              │
│  - lists available skills  │
│  - rules for when to load  │
│                            │
│  Tool: loadSkill(skillName)│
└────────────┬───────────────┘
             │  (only called when needed)
      ┌──────▼──────┐
      │  SKILLS     │
      │  registry   │
      │             │
      │ budget_     │
      │ analysis    │
      │             │
      │ investment_ │
      │ advice      │
      │             │
      │ debt_       │
      │ management  │
      └─────────────┘
             │
     Skill prompt returned
     → injected into context
     → agent answers with
       domain depth
```

The agent itself never changes — only its context grows when a skill is loaded.

---

## What You'll Learn

- Building a `SKILLS` registry as a typed `Record<string, string>`
- Writing detailed prompt templates as skill definitions
- Creating a single `loadSkill` tool that serves all skills
- Crafting a base system prompt that guides the agent on when to load skills
- Understanding why this pattern keeps the base context window small

---

## Prerequisites

```typescript
import { tool } from "@langchain/core/tools";
import { ChatOpenAI } from "@langchain/openai";
import { z } from "zod";
import { createAgent } from "../agent/create-agent"; // adjust path as needed
```

```typescript
const model = new ChatOpenAI({ model: "gpt-4o-mini", temperature: 0 });
```

---

## Step-by-Step Instructions

### Step 1: Define the SKILLS registry

Create a `SKILLS` constant typed as `Record<string, string>`. Each value is a multi-line string that becomes the agent's complete domain prompt when that skill is loaded.

Write three skill prompt templates:

**`budget_analysis`** — Your prompt should instruct the agent to:
- Break spending into standard categories (housing, food, transport, entertainment, savings)
- Identify the 50/30/20 rule and whether the user's spending aligns with it
- Flag categories where spending seems disproportionate
- Ask clarifying questions if the user hasn't provided enough data (e.g., monthly income)
- Always output a structured breakdown when analyzing a budget

**`investment_advice`** — Your prompt should instruct the agent to:
- Ask about the user's investment timeline and risk tolerance before advising
- Explain the difference between active and passive investing when relevant
- Recommend diversification principles (don't concentrate in single assets)
- Reference common vehicles: index funds, ETFs, Roth IRA, 401k
- Add a disclaimer that this is educational guidance, not financial advice

**`debt_management`** — Your prompt should instruct the agent to:
- List all debts the user mentions with interest rates and balances
- Explain the debt avalanche method (highest interest first) vs. snowball (smallest balance first)
- Calculate or estimate a payoff timeline when enough data is provided
- Emphasize the importance of an emergency fund before aggressively paying down debt
- Warn against using retirement savings to pay off debt

> **Tip:** The richer your skill prompts, the more useful and focused the agent's answers will be. Treat each skill like writing a mini system prompt for a domain expert.

---

### Step 2: Create the `loadSkill` tool

This is the only tool your agent needs. It should:

1. Accept `{ skillName: string }` as its input
2. Look up `skillName` in the `SKILLS` registry
3. Return the full skill prompt string if found
4. Return a helpful error message listing available skills if not found

```typescript
const loadSkill = tool(
  ({ skillName }) => {
    const skill = SKILLS[skillName];
    if (!skill) {
      const available = Object.keys(SKILLS).join(", ");
      return `Skill '${skillName}' not found. Available skills: ${available}`;
    }
    return skill;
  },
  {
    name: "load_skill",
    description: "Loads a specialized financial domain skill to enhance your expertise for the current question.",
    schema: z.object({
      skillName: z.string().describe("One of: budget_analysis, investment_advice, debt_management"),
    }),
  }
);
```

---

### Step 3: Create the finance advisor agent

Write a base system prompt that:
- Establishes the agent's identity as a personal finance advisor
- Lists the three available skills **by name**
- Explains when to call `load_skill`: when the user's question clearly falls into one of the skill domains
- Explains when **not** to call `load_skill`: for general questions it can answer from common knowledge
- States that after calling `load_skill`, the agent should use the returned guidelines to answer

```typescript
export const financeAdvisorAgent = createAgent({
  model,
  tools: [loadSkill],
  systemPrompt: `You are a knowledgeable personal finance advisor helping users make better financial decisions.

You have access to specialized skills that give you deep domain expertise:
- budget_analysis: for questions about spending, budgeting, and where money is going
- investment_advice: for questions about investing, stocks, retirement, and portfolio allocation
- debt_management: for questions about paying off debt, loans, and credit cards

When a user's question clearly falls into one of these domains, call load_skill with the matching skill name BEFORE answering.
For general financial questions, answer directly from your base knowledge.

After loading a skill, follow its guidelines carefully when crafting your response.`,
});
```

---

### Step 4: Test across all three scenarios

Test your agent with one question per skill, plus a general question that should NOT trigger any skill load:

```typescript
import { HumanMessage } from "@langchain/core/messages";

// Should load: budget_analysis
const r1 = await financeAdvisorAgent.invoke({
  messages: [new HumanMessage("I make $5,000/month but I always run out of money. I spend about $2,000 on rent, $600 on food, $400 on subscriptions, and the rest just disappears. Help me figure out where it's going.")],
});

// Should load: investment_advice
const r2 = await financeAdvisorAgent.invoke({
  messages: [new HumanMessage("I'm 28 and want to start investing. I have $10,000 saved. Should I put it in individual stocks or ETFs? What about a Roth IRA?")],
});

// Should load: debt_management
const r3 = await financeAdvisorAgent.invoke({
  messages: [new HumanMessage("I have $8,000 on a credit card at 22% APR and a $15,000 student loan at 5%. Which should I pay off first?")],
});

// Should NOT load any skill
const r4 = await financeAdvisorAgent.invoke({
  messages: [new HumanMessage("Is it generally a good idea to have 3 months of expenses as an emergency fund?")],
});

console.log(r1.messages.at(-1)?.content);
```

---

## Expected Behavior

For the investment question (r2), you should see the agent call `load_skill("investment_advice")` and then answer with structured guidance including risk tolerance questions, a mention of the Roth IRA contribution limits, and diversification advice — rather than a generic "it depends" answer.

For the general question (r4), the agent should answer directly without calling any tool.

Look at the intermediate messages to confirm tool calls are happening:

```typescript
r2.messages.forEach((m, i) => console.log(i, m._getType(), m.content?.toString().slice(0, 80)));
```

---

## Bonus Challenges

1. **Add a fourth skill** — create a `tax_optimization` skill covering deductions, tax-advantaged accounts, and common filing mistakes. Update the base prompt to mention it.

2. **Skill chaining** — modify the agent's base prompt to allow loading **two skills at once** when a question spans domains (e.g., "I want to invest but I also have debt — what should I do first?"). Does the agent chain the skill calls correctly?

3. **Dynamic skill registry** — instead of hardcoding the `SKILLS` object, load skill prompts from separate `.txt` files at runtime. Update `loadSkill` to read from disk. This simulates a production pattern where skills are maintained by different teams independently.
