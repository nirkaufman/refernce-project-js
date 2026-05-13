import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  optimizeDeps: {
    // p-queue and p-retry are CJS packages — Vite must pre-bundle them to ESM.
    include: ["p-queue", "p-retry"],
    // Server-only packages: never bundle these into the browser build.
    exclude: ["langchain", "@langchain/openai", "@langchain/core", "express", "cors", "dotenv"],
  },
});
