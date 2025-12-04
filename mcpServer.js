/**
 * REAL MCP SERVER (SSE) using @modelcontextprotocol/sdk
 *
 * - Exposes /sse and /messages
 * - Uses the official SSEServerTransport pattern
 * - Forwards tool calls to your existing universal-adapter web API
 */

import express from "express";
import dotenv from "dotenv";
import axios from "axios";

import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { SSEServerTransport } from "@modelcontextprotocol/sdk/server/sse.js";
import { z } from "zod";

dotenv.config();

// ---------------------------------------------------------------
// 1. CREATE MCP SERVER
// ---------------------------------------------------------------

const server = new McpServer({
  name: "universal-adapter-mcp",
  version: "1.0.0",
});

const baseUrl = process.env.UNI_ADAPTER_WEB_URL;

// ---------------------------------------------------------------
// 2. REGISTER TOOLS (call your existing REST API)
// ---------------------------------------------------------------

// Pinecone Query
server.tool(
  "pinecone_query",
  {
    description: "Query Pinecone index via universal-adapter REST API",
    inputSchema: z.object({
      vector: z.array(z.number()),
      topK: z.number(),
      indexName: z.string().optional(),
      filter: z.any().optional(),
    }),
  },
  async ({ vector, topK, indexName, filter }) => {
    if (!baseUrl) throw new Error("UNI_ADAPTER_WEB_URL is not set");

    const url = `${baseUrl}/api/pinecone/search`;
    const response = await axios.post(url, {
      vector,
      topK,
      indexName,
      filter,
    });

    return {
      content: [
        { type: "text", text: JSON.stringify(response.data, null, 2) },
      ],
    };
  }
);

// Pinecone Upsert
server.tool(
  "pinecone_upsert",
  {
    description: "Upsert vectors into Pinecone via universal-adapter REST API",
    inputSchema: z.object({
      vectors: z.array(
        z.object({
          id: z.string(),
          values: z.array(z.number()),
          metadata: z.any().optional(),
        })
      ),
      indexName: z.string().optional(),
    }),
  },
  async ({ vectors, indexName }) => {
    if (!baseUrl) throw new Error("UNI_ADAPTER_WEB_URL is not set");

    const url = `${baseUrl}/api/pinecone/upsert`;
    const response = await axios.post(url, {
      vectors,
      indexName,
    });

    return {
      content: [
        { type: "text", text: JSON.stringify(response.data, null, 2) },
      ],
    };
  }
);

// Notion Get Page
server.tool(
  "notion_get_page",
  {
    description: "Get a Notion page via universal-adapter REST API",
    inputSchema: z.object({
      pageId: z.string(),
    }),
  },
  async ({ pageId }) => {
    if (!baseUrl) throw new Error("UNI_ADAPTER_WEB_URL is not set");

    const url = `${baseUrl}/api/notion/page`;
    const response = await axios.post(url, { pageId });

    return {
      content: [
        { type: "text", text: JSON.stringify(response.data, null, 2) },
      ],
    };
  }
);

// ---------------------------------------------------------------
// 3. EXPRESS APP + SSE TRANSPORT
// ---------------------------------------------------------------

const app = express();

// IMPORTANT: We will pass req.body explicitly to handlePostMessage
app.use(express.json());

// Health check
app.get("/", (_req, res) => {
  res.json({ ok: true, message: "Official MCP server is running" });
});

// Keep track of the current SSE transport (simple, single-client version)
let transport = /** @type {SSEServerTransport | null} */ (null);

// /sse endpoint: establishes the SSE connection
app.get("/sse", async (req, res) => {
  // Create a new transport for this connection
  transport = new SSEServerTransport("/messages", res);

  // When the client disconnects, clear the transport
  res.on("close", () => {
    transport = null;
  });

  // Connect MCP server to this transport
  await server.connect(transport);
});

// /messages endpoint: receives MCP messages from the client
app.post("/messages", async (req, res) => {
  if (!transport) {
    return res.status(400).send("No active transport session");
  }

  // Pass the parsed body explicitly (works with express.json())
  await transport.handlePostMessage(req, res, req.body);
});

// ---------------------------------------------------------------
// 4. START SERVER
// ---------------------------------------------------------------

const port = process.env.PORT || process.env.MCP_SERVER_PORT || 9000;

app.listen(port, () => {
  console.log(`🔥 MCP server running on port ${port}`);
  console.log(`SSE endpoint: http://localhost:${port}/sse`);
  console.log(`Messages endpoint: http://localhost:${port}/messages`);
});