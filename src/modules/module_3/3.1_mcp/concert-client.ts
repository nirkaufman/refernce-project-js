import "dotenv/config";
import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";
import { MemorySaver } from "@langchain/langgraph";
import { HumanMessage } from "@langchain/core/messages";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const SERVER_PATH = "./src/5-mcp/concert-server.ts";

// Connect raw MCP client to fetch prompt
const transport = new StdioClientTransport({
  command: "npx",
  args: ["tsx", SERVER_PATH],
});

const client = new Client({ name: "prompt-client", version: "1.0.0" }, { capabilities: {} });
await client.connect(transport);

// Fetch the concert-assistant prompt
const promptResult = await client.getPrompt({
  name: "concert-assistant",
  arguments: { query: "" },
});

// Extract text from prompt message
const systemPrompt = promptResult.messages[0]?.content.type === "text"
  ? promptResult.messages[0].content.text
  : "";

await client.close();

// Create MCP client connecting to the concert server via stdio
const mcpClient = new MultiServerMCPClient({
  concert: {
    transport: "stdio",
    command: "npx",
    args: ["tsx", SERVER_PATH],
  },
});

// Load tools from the MCP server
const tools = await mcpClient.getTools();

// Create agent with MCP tools and checkpointer for LangGraph Studio
const checkpointer = new MemorySaver();

export const agent = createAgent({
  model: "gpt-4o",
  tools,
  checkpointer,
  systemPrompt,
});

// Demo invocation - only runs when executed directly via CLI
// Run with: npx tsx src/5-mcp/concert-client.ts
if (process.argv[1]?.includes("concert-client")) {
  const queries = [
    "Find me Taylor Swift concerts",
    "Book 2 tickets for the Taylor Swift concert (ID: 1)",
    "What concerts are available at stadiums?",
  ];

  for (const query of queries) {
    console.log(`\nQuery: ${query}`);
    const response = await agent.invoke({
      messages: [new HumanMessage(query)],
    });
    const result = response.messages[response.messages.length - 1];
    console.log("Agent:", result.content);
  }

  await mcpClient.close();
}
