import { createAgent, createMiddleware, initChatModel, tool } from "langchain";
import { readFileSync, writeFileSync } from "fs";
import z from "zod";

const readFile = tool(
  ({ filename }) => readFileSync(filename, "utf-8"),
  {
    name: "read_file",
    description: "Read a file from disk.",
    schema: z.object({ filename: z.string() }),
  }
);

const writeFile = tool(
  ({ filename, content }) => {
    writeFileSync(filename, content);
    return `File ${filename} written successfully.`;
  },
  {
    name: "write_file",
    description: "Write to a file.",
    schema: z.object({ filename: z.string(), content: z.string() }),
  }
);

const contextSchema = z.object({
  userRole: z.string(),
});

type Context = z.infer<typeof contextSchema>;

const contextBasedTools = createMiddleware({
  name: "ContextBasedTools",
  wrapModelCall: (request, handler) => {
    const userRole = (request.runtime.context as Context).userRole;
    let tools = request.tools;

    if (userRole === "editor") {
      tools = request.tools.filter((t) => (t.name as string).startsWith("write_"));
    } else if (userRole !== "admin") {
      tools = request.tools.filter((t) => (t.name as string).startsWith("read_"));
    }

    console.log(`Selected tools: ${tools.map((t) => t.name).join(", ")}`);
    return handler({ ...request, tools });
  },
});

const model = await initChatModel('gpt-5-nano');
const allTools = [readFile, writeFile];

export const runtimeTools = createAgent({
  model,
  tools: allTools,
  contextSchema,
  middleware: [contextBasedTools],
});
