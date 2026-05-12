import {createAgent, humanInTheLoopMiddleware, initChatModel, type ReactAgent, tool} from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { writeFileSync } from "fs";
import z from "zod";

const writeFile = tool(
  ({ filename, content }) => {
    writeFileSync(filename, content);
    return `Wrote ${filename} to disk.`;
  },
  {
    name: "write_file",
    description: "Write a file to disk.",
    schema: z.object({ filename: z.string(), content: z.string() }),
  }
);

const executeSql = tool(
  ({ query }) => `Executing SQL query: ${query}`,
  {
    name: "execute_sql",
    description: "Execute an SQL query.",
    schema: z.object({ query: z.string() }),
  }
);

const readData = tool(
  ({ query }) => `Reading data from database: ${query}`,
  {
    name: "read_data",
    description: "Read data from a database.",
    schema: z.object({ query: z.string() }),
  }
);

const model = await initChatModel('gpt-5-nano');

// Explicit type required: humanInTheLoopMiddleware references internal LangGraph interrupt
// types that are not re-exported through the public "langchain" entry point. Without the
// annotation, TypeScript cannot name the inferred type in the emitted declaration file (TS2742).
// to pass in studio type: `{ "decisions": [{ "type": "approve" }] }`
export const humanLoop: ReactAgent = createAgent({
  model,
  tools: [writeFile, executeSql, readData],
  middleware: [
    humanInTheLoopMiddleware({
      interruptOn: {
        write_file: { allowedDecisions: ["approve", "reject"] },
        execute_sql: { allowedDecisions: ["approve", "reject"] },
        read_data: false,
      },
      descriptionPrefix: "Tool execution pending approval",
    }),
  ],
  // Human-in-the-loop requires checkpointing to handle interrupts.
  // In production, use a persistent checkpointer like AsyncPostgresSaver.
  checkpointer: new MemorySaver(),
});
