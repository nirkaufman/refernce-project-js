/**
 * HANDOFFS PATTERN — Customer support pipeline
 * ---------------------------------------------
 * A SINGLE agent changes its own behavior based on state. A tool call triggers
 * a "handoff" — it writes a new value to `currentStep` in state. Before the
 * next model call, middleware reads `currentStep` and swaps the system prompt
 * and available tools. The agent literally becomes a different specialist at
 * each stage of the conversation.
 *
 * Compare to other patterns:
 *   Supervisor (3.3.1) — many sub-agents called by a central orchestrator; parallel ok
 *   Skills    (3.3.3)  — one agent, loads prompts on-demand; no enforced step order
 *   Router    (3.3.4)  — classifies once upfront and routes to a separate agent
 *
 * When to use this pattern:
 *   - You need sequential constraints (collect warranty info BEFORE resolving)
 *   - The agent converses directly with the user across multiple turns
 *   - Each step must "unlock" the next (triage → classify → resolve)
 *
 * Flow: triage (warranty?) → classify (issue type?) → resolve
 *   in_warranty  + software → troubleshooting steps
 *   in_warranty  + hardware → warranty repair
 *   no_warranty  + software → troubleshooting steps
 *   no_warranty  + hardware → escalate to human
 */

import { createAgent, createMiddleware, initChatModel, tool } from "langchain";
import { ToolMessage } from "@langchain/core/messages";
import { Command, MessagesValue, StateSchema } from "@langchain/langgraph";
import type { ToolRuntime } from "@langchain/core/tools";
import z from "zod";

// ---------------------------------------------------------------------------
// State — the single source of truth that drives all handoffs.
// currentStep is the handoff signal read by middleware before every model call.
// ---------------------------------------------------------------------------

const SupportState = new StateSchema({
  messages: MessagesValue,
  currentStep: z.string().default("triage"),
  warrantyStatus: z.enum(["in_warranty", "no_warranty"]).optional(),
  issueType: z.enum(["software", "hardware"]).optional(),
});

type SupportStateType = typeof SupportState.State;

// ---------------------------------------------------------------------------
// Handoff tools — writing to state IS the handoff.
// Each returns a Command that updates currentStep, which triggers middleware
// to reconfigure the agent before the next model call.
// ---------------------------------------------------------------------------

const recordWarrantyStatus = tool(
  async (
    { status }: { status: "in_warranty" | "no_warranty" },
    runtime: ToolRuntime<SupportStateType>
  ) => {
    return new Command({
      update: {
        messages: [new ToolMessage({ content: `Warranty: ${status}`, tool_call_id: runtime.toolCallId })],
        warrantyStatus: status,
        currentStep: "classify", // <-- handoff: next model call will use the classify config
      },
    });
  },
  {
    name: "record_warranty_status",
    description: "Record warranty status and hand off to issue classification.",
    schema: z.object({ status: z.enum(["in_warranty", "no_warranty"]) }),
  }
);

const recordIssueType = tool(
  async (
    { issueType }: { issueType: "software" | "hardware" },
    runtime: ToolRuntime<SupportStateType>
  ) => {
    return new Command({
      update: {
        messages: [new ToolMessage({ content: `Issue: ${issueType}`, tool_call_id: runtime.toolCallId })],
        issueType,
        currentStep: "resolve", // <-- handoff: next model call will use the resolve config
      },
    });
  },
  {
    name: "record_issue_type",
    description: "Record issue type and hand off to resolution.",
    schema: z.object({ issueType: z.enum(["software", "hardware"]) }),
  }
);

// ---------------------------------------------------------------------------
// Resolution tools — leaf actions, no further handoffs
// ---------------------------------------------------------------------------

const provideTroubleshootingSteps = tool(
  ({ issueDescription }: { issueDescription: string }) =>
    `Troubleshooting steps for: ${issueDescription}\n` +
    "1. Restart the device.\n" +
    "2. Check for software updates.\n" +
    "3. Clear app cache.\n" +
    "4. Reinstall the app if the issue persists.",
  {
    name: "provide_troubleshooting_steps",
    description: "Provide software troubleshooting steps to the customer.",
    schema: z.object({ issueDescription: z.string() }),
  }
);

const initiateWarrantyRepair = tool(
  ({ issueDescription }: { issueDescription: string }) =>
    `Warranty repair initiated for: ${issueDescription}\n` +
    "A prepaid shipping label has been emailed to you.\n" +
    "Expected turnaround: 5–7 business days.",
  {
    name: "initiate_warranty_repair",
    description: "Initiate a warranty repair request for a hardware issue.",
    schema: z.object({ issueDescription: z.string() }),
  }
);

const escalateToHuman = tool(
  ({ issueDescription }: { issueDescription: string }) =>
    `Escalating to human agent for: ${issueDescription}\n` +
    "A specialist will contact you within 24 hours. Case ID: #CS-2026-001.",
  {
    name: "escalate_to_human",
    description: "Escalate the case to a human support agent.",
    schema: z.object({ issueDescription: z.string() }),
  }
);

// ---------------------------------------------------------------------------
// Step config map — each step defines a focused persona + restricted tool set.
// The right config is selected by middleware based on currentStep in state.
// ---------------------------------------------------------------------------

function getConfig(step: string, warranty?: string, issue?: string) {
  if (step === "triage") {
    return {
      prompt: "You are a triage agent. Ask if the device is under warranty, then call record_warranty_status.",
      tools: [recordWarrantyStatus],
    };
  }
  if (step === "classify") {
    return {
      prompt: "Ask whether the issue is software (crashes, bugs) or hardware (screen, battery). Call record_issue_type.",
      tools: [recordIssueType],
    };
  }
  // resolve — outcome depends on the state collected in earlier steps
  if (issue === "hardware" && warranty === "no_warranty") {
    return {
      prompt: "This hardware issue has no warranty coverage. Escalate using escalate_to_human.",
      tools: [escalateToHuman],
    };
  }
  if (issue === "hardware") {
    return {
      prompt: "The device is under warranty. Initiate a repair using initiate_warranty_repair.",
      tools: [initiateWarrantyRepair],
    };
  }
  return {
    prompt: "Provide software troubleshooting steps using provide_troubleshooting_steps.",
    tools: [provideTroubleshootingSteps],
  };
}

// ---------------------------------------------------------------------------
// Middleware — intercepts every model call to apply the current step's config.
// This is what makes the handoff take effect: same agent, different behavior.
// ---------------------------------------------------------------------------

const applyStepConfig = createMiddleware({
  name: "ApplyStepConfig",
  wrapModelCall: (request, handler) => {
    const state = request.state as SupportStateType;
    const config = getConfig(
      state.currentStep ?? "triage",
      state.warrantyStatus,
      state.issueType
    );
    // Override the prompt and tool list before the model call
    return handler({ ...request, systemPrompt: config.prompt, tools: config.tools });
  },
});

// ---------------------------------------------------------------------------
// Agent — one agent, all tools registered upfront, middleware drives handoffs.
// All tools must be registered here so LangGraph knows how to execute them;
// the middleware restricts which ones are VISIBLE to the model at each step.
// ---------------------------------------------------------------------------

const model = await initChatModel("gpt-4o");

export const supportAgent = createAgent({
  model,
  tools: [
    recordWarrantyStatus,
    recordIssueType,
    provideTroubleshootingSteps,
    initiateWarrantyRepair,
    escalateToHuman,
  ],
  stateSchema: SupportState,
  middleware: [applyStepConfig],
});
