import { MultiServerMCPClient } from "@langchain/mcp-adapters";
import { createAgent } from "langchain";


const systemPrompt = `
  You are a travel assistant powered by Kiwi flight search.

  Rules:
  - Today is ${new Date().toISOString().split('T')[0]}
  - Always use future dates in YYYY-MM-DD format
  - Convert relative dates ("next week", "in March") to actual dates
  - Use IATA airport codes when possible (e.g., JFK, LHR, CDG)
  - If a date is ambiguous or in the past, ask for clarification`;

// Create MCP client connecting to remote Kiwi travel server via HTTP
const mcpClient = new MultiServerMCPClient({
  travel_server: {
    transport: "http",
    url: "https://mcp.kiwi.com",
  },
});

// Load tools from the remote MCP server
const tools = await mcpClient.getTools();

console.log(tools);


// Create agent with MCP tools and checkpointer for LangGraph Studio
// const checkpointer = new MemorySaver();

export const agent = createAgent({
  model: "gpt-4o",
  tools,
  // checkpointer,
  systemPrompt
});
