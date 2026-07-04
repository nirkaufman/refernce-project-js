import "dotenv/config";
import { initChatModel } from "langchain";

/**
 * Model configuration
 * -------------------
 * initChatModel is LangChain's universal model factory: pass a model name,
 * get back a standardized chat model. Provider is inferred from the name.
 *
 * Key options:
 *   temperature — creativity dial. 0 = deterministic, 1 = creative.
 *   maxTokens   — hard cap on response length.
 *   timeout     — ms before a hanging request is aborted.
 */

// Balanced model for reasoning-heavy work (research, orchestration)
export const model = await initChatModel("gpt-4o", {
  temperature: 0.3,
  timeout: 60_000,
});

// Creative model for writing tasks (articles, social posts)
export const creativeModel = await initChatModel("gpt-4o", {
  temperature: 0.8,
  maxTokens: 4000,
  timeout: 60_000,
});
