import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

// Hardcoded concert data
const CONCERTS = [
  { id: "1", artist: "Taylor Swift", venue: "Madison Square Garden", date: "2025-06-15", price: 150, available: 50 },
  { id: "2", artist: "Coldplay", venue: "Wembley Stadium", date: "2025-07-20", price: 120, available: 200 },
  { id: "3", artist: "The Weeknd", venue: "SoFi Stadium", date: "2025-08-10", price: 180, available: 75 },
];

// Track bookings (in-memory for demo)
const bookings: Array<{ concertId: string; quantity: number; confirmationCode: string }> = [];

// Create the MCP server
const server = new McpServer(
  { name: "concert-server", version: "1.0.0" },
  { capabilities: { tools: {}, resources: {}, prompts: {} } }
);

// Tool 1: Search concerts by artist or venue
server.registerTool(
  "search_concerts",
  {
    title: "Search Concerts",
    description: "Search for available concerts by artist name or venue. Returns matching concerts with details.",
    inputSchema: {
      query: z.string().describe("Artist name or venue to search for"),
    },
  },
  async ({ query }) => {
    const lowerQuery = query.toLowerCase();
    const matches = CONCERTS.filter(
      (c) =>
        c.artist.toLowerCase().includes(lowerQuery) ||
        c.venue.toLowerCase().includes(lowerQuery)
    );

    if (matches.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No concerts found matching "${query}". Available artists: ${CONCERTS.map((c) => c.artist).join(", ")}`,
          },
        ],
      };
    }

    const results = matches.map(
      (c) =>
        `ID: ${c.id} | ${c.artist} at ${c.venue} on ${c.date} - $${c.price} (${c.available} tickets left)`
    );

    return {
      content: [
        {
          type: "text",
          text: `Found ${matches.length} concert(s):\n${results.join("\n")}`,
        },
      ],
    };
  }
);

// Tool 2: Book tickets for a concert
server.registerTool(
  "book_tickets",
  {
    title: "Book Tickets",
    description: "Book tickets for a specific concert. Returns a confirmation code on success.",
    inputSchema: {
      concertId: z.string().describe("The concert ID to book tickets for"),
      quantity: z.number().min(1).max(10).describe("Number of tickets to book (1-10)"),
    },
  },
  async ({ concertId, quantity }) => {
    const concert = CONCERTS.find((c) => c.id === concertId);

    if (!concert) {
      return {
        content: [
          {
            type: "text",
            text: `Concert with ID "${concertId}" not found. Use search_concerts to find available concerts.`,
          },
        ],
      };
    }

    if (concert.available < quantity) {
      return {
        content: [
          {
            type: "text",
            text: `Sorry, only ${concert.available} tickets available for ${concert.artist}. Requested: ${quantity}`,
          },
        ],
      };
    }

    // Process booking
    concert.available -= quantity;
    const confirmationCode = `CONF-${Date.now().toString(36).toUpperCase()}`;
    bookings.push({ concertId, quantity, confirmationCode });

    const totalCost = concert.price * quantity;

    return {
      content: [
        {
          type: "text",
          text: `Booking confirmed!\n` +
            `Confirmation Code: ${confirmationCode}\n` +
            `Event: ${concert.artist} at ${concert.venue}\n` +
            `Date: ${concert.date}\n` +
            `Tickets: ${quantity}\n` +
            `Total: $${totalCost}`,
        },
      ],
    };
  }
);

// Resource: Full concert catalog
server.registerResource(
  "catalog",
  "concerts://catalog",
  {
    title: "Concert Catalog",
    description: "The full catalog of available concerts with all details",
    mimeType: "application/json",
  },
  async (uri) => ({
    contents: [
      {
        uri: uri.href,
        mimeType: "application/json",
        text: JSON.stringify(CONCERTS, null, 2),
      },
    ],
  })
);

// Prompt: Concert assistant template
server.registerPrompt(
  "concert-assistant",
  {
    title: "Concert Assistant",
    description: "A helpful prompt template for concert booking assistance",
    argsSchema: {
      query: z.string().describe("The user's concert-related query"),
    },
  },
  ({ query }) => ({
    messages: [
      {
        role: "user",
        content: {
          type: "text",
          text: `You are a helpful concert booking assistant. Help the user with their request.\n\n` +
            `Available actions:\n` +
            `- Search for concerts by artist or venue using search_concerts\n` +
            `- Book tickets using book_tickets (requires concert ID and quantity)\n` +
            `- View the full catalog via the concerts://catalog resource\n\n` +
            `User request: ${query}`,
        },
      },
    ],
  })
);

// Start the server with stdio transport
async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);

  console.error("Concert MCP Server running on stdio...");
}

main().catch(console.error);
