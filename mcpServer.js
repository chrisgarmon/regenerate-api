import express from "express";
import cors from "cors";
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

// ---------------------------------------------------------------
// 2. REGISTER TOOLS (call your existing REST API)
// ---------------------------------------------------------------

// NOTE: Set this in Render env for your web API service URL
const baseUrl = process.env.UNI_ADAPTER_WEB_URL;

// Pinecone Query tool
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
    if (!baseUrl) {
      throw new Error("UNI_ADAPTER_WEB_URL is not set");
    }

    const url = `${baseUrl}/api/pinecone/search`;
    const response = await axios.post(url, {
      vector,
      topK,
      indexName,
      filter,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }
);

// Pinecone Upsert tool
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
    if (!baseUrl) {
      throw new Error("UNI_ADAPTER_WEB_URL is not set");
    }

    const url = `${baseUrl}/api/pinecone/upsert`;
    const response = await axios.post(url, {
      vectors,
      indexName,
    });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }
);

// Notion Get Page tool
server.tool(
  "notion_get_page",
  {
    description: "Get a Notion page via universal-adapter REST API",
    inputSchema: z.object({
      pageId: z.string(),
    }),
  },
  async ({ pageId }) => {
    if (!baseUrl) {
      throw new Error("UNI_ADAPTER_WEB_URL is not set");
    }

    const url = `${baseUrl}/api/notion/page`;
    const response = await axios.post(url, { pageId });

    return {
      content: [
        {
          type: "text",
          text: JSON.stringify(response.data, null, 2),
        },
      ],
    };
  }
);

// ---------------------------------------------------------------
// 3. EXPRESS APP + TRANSPORTS
// ---------------------------------------------------------------

const app = express();
app.use(cors());
app.use(express.json());

// Root health route
app.get("/", (req, res) => {
  res.json({ ok: true, message: "Official MCP server is running" });
});

// Create transports
const sse = new SSEServerTransport("/sse");

// Attach transports
sse.attach(server);
httpTransport.attach(server);

// Register with Express
sse.registerExpress(app);
httpTransport.registerExpress(app);

// ---------------------------------------------------------------
// 4. START SERVER
// ---------------------------------------------------------------

const port = process.env.PORT || process.env.MCP_SERVER_PORT || 9000;

app.listen(port, () => {
  console.log(`🔥 MCP server running on port ${port}`);
  console.log(`SSE endpoint: http://localhost:${port}/sse`);
  console.log(`Messages endpoint: http://localhost:${port}/messages`);
});