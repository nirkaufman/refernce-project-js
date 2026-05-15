# Exercise: PII Detection Middleware

**Module:** 2.1 Middleware — Declarative PII Protection
**Estimated time:** 20–30 minutes
**Reference:** `src/modules/module_2/2.1_middleware/2.1.1_pii_detection.ts`

---

## What You'll Build

A **medical intake chatbot** that collects patient information to prepare them for an appointment. Because patients often share sensitive health-related details, the agent must automatically protect two types of PII before any message reaches the model:

- **Social Security Numbers** (SSN) — must be fully **redacted** (removed entirely)
- **Phone numbers** — must be **masked** (partially hidden, e.g., `***-***-1234`)

The agent itself never sees the raw sensitive data — the middleware intercepts and sanitizes input before the LLM is called.

---

## Architecture Diagram

```
User message (raw)
  "My SSN is 123-45-6789 and you can reach me at 555-867-5309"
        │
        ▼
┌─────────────────────────────┐
│  piiMiddleware("ssn")       │  → strategy: "redact"  → removes SSN entirely
│  piiMiddleware("phone")     │  → strategy: "mask"    → hides digits: ***-***-5309
└─────────────────────────────┘
        │
        ▼
Sanitized message reaches model:
  "My SSN is [REDACTED] and you can reach me at ***-***-5309"
        │
        ▼
┌─────────────────┐
│  Medical Intake │
│      Agent      │
└─────────────────┘
```

---

## What You'll Learn

- Stacking multiple `piiMiddleware()` instances in a single agent
- The difference between `"redact"` (remove entirely) and `"mask"` (partially hide) strategies
- Using `applyToInput: true` to protect incoming user messages
- How declarative PII middleware composes with `createAgent()`

---

## Prerequisites

```typescript
import { initChatModel } from "langchain/chat_models/universal";
import { piiMiddleware } from "../agent/middleware"; // adjust path as needed
import { createAgent } from "../agent/create-agent";
```

```typescript
const model = await initChatModel("gpt-4o-mini", {
  temperature: 0,
  maxTokens: 500,
});
```

---

## Step-by-Step Instructions

### Step 1: Understand the PII middleware signature

The `piiMiddleware` function accepts two arguments:
1. The **type** of PII to detect — a string identifying the pattern (e.g., `"email"`, `"credit_card"`, `"ssn"`, `"phone"`)
2. An **options object** with:
   - `strategy`: `"redact"` (remove entirely) or `"mask"` (hide most digits/characters)
   - `applyToInput`: `true` means the middleware intercepts user messages **before** the model sees them

---

### Step 2: Stack two PII middleware instances

Create a `piiProtection` array with two middleware entries:

1. For **SSN**: use `strategy: "redact"` — SSNs are so sensitive they should never reach the model even in masked form.
2. For **phone numbers**: use `strategy: "mask"` — showing the last 4 digits is acceptable for confirmation purposes.

```typescript
const piiProtection = [
  piiMiddleware("ssn",   { strategy: "redact", applyToInput: true }),
  piiMiddleware("phone", { strategy: "mask",   applyToInput: true }),
];
```

> **Think about ordering:** Does it matter which middleware runs first? What would happen if both fired on the same span of text?

---

### Step 3: Create the medical intake agent

Build the agent with a system prompt appropriate for a healthcare intake assistant. The prompt should:

- Welcome the patient and explain the purpose of the intake
- Ask for their full name, date of birth, and chief complaint
- Explicitly tell the model: **do not ask for or repeat any government ID numbers or contact details** — this reinforces the PII protection at the prompt level

```typescript
export const medicalIntakeAgent = createAgent({
  model,
  tools: [],
  middleware: piiProtection,
  systemPrompt: `You are a medical intake assistant helping patients prepare for their appointment.

Collect the following information conversationally:
1. Patient's full name
2. Date of birth
3. Primary reason for today's visit (chief complaint)
4. Any known allergies

Important: Do NOT ask for, repeat, or confirm Social Security Numbers, insurance IDs, or phone numbers.
If a patient volunteers such information, simply acknowledge and move on.`,
});
```

---

### Step 4: Test with sensitive inputs

Invoke the agent with messages that contain the PII types you're protecting:

```typescript
import { HumanMessage } from "@langchain/core/messages";

const result = await medicalIntakeAgent.invoke({
  messages: [
    new HumanMessage(
      "Hi, I'm here for my appointment. My name is Sarah Connor. " +
      "My SSN is 078-05-1120 and my phone is 555-234-7890. " +
      "I have a severe headache that started two days ago."
    ),
  ],
});

console.log(result.messages.at(-1)?.content);
```

---

## Expected Behavior

The model should never see the raw SSN or phone number. Its response should acknowledge the relevant intake information (name, symptom) while treating the sensitive fields as if they were already removed or masked:

```
Thank you, Sarah. I've noted your chief complaint — a severe headache starting two days ago.
To complete the intake, could you also share your date of birth and any known allergies?
```

The SSN should be completely absent from the model's context. The phone number, if echoed back, would appear as `***-***-7890`.

---

## Bonus Challenges

1. **Add output protection** — explore whether `piiMiddleware` supports an `applyToOutput: true` flag. If so, add a third middleware that masks any phone numbers the model itself might generate in its response.

2. **Custom PII pattern** — the reference code uses built-in types. Research whether `piiMiddleware` supports custom regex patterns. If so, add a rule that redacts any 10-digit medical record numbers (format: `MRN-XXXXXXXXXX`).

3. **Audit logging** — combine the PII middleware with a custom `afterModel` hook (from 2.1.3) that logs a redacted version of every user message to a compliance log file, without exposing the raw PII.
