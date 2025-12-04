/**
 * REAL MCP SERVER (SSE)
 *
 * - Uses @modelcontextprotocol/sdk
 * - Exposes /sse and /messages for ChatGPT MCP connector
 * - Automatically handles MCP initialize, tools/list, tools/call
 * - Forwards tool calls to your existing REST API so you maintain logic only once
 */

import express from "express";
import cors from "cors";
import dotenv from "dotenv";
import axios from "axios";

import {
  McpServer,
  SSEServerTransport,
  HTTPServerTransport,
  z,
} from "@modelcontextprotocol/sdk";

dotenv.config();

// ---------------------------------------------------------------
// 1. CREATE MCP SERVER
// ---------------------------------------------------------------

const server = new McpServer({
  name: "universal-adapter-mcp",
  version: "1.0.0",
});

// ---------------------------------------------------------------
// 2. REGISTER TOOLS (these can call your existing REST API)
// ---------------------------------------------------------------

// 2A. Pinecone Query tool
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
    const url = `${process.env.UNI_ADAPTER_WEB_URL}/api/pinecone/search`;

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

// 2B. Pinecone Upsert tool
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
    const url = `${process.env.UNI_ADAPTER_WEB_URL}/api/pinecone/upsert`;

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

// 2C. Notion Get Page tool
server.tool(
  "notion_get_page",
  {
    description: "Get a Notion page via universal-adapter REST API",
    inputSchema: z.object({
      pageId: z.string(),
    }),
  },
  async ({ pageId }) => {
    const url = `${process.env.UNI_ADAPTER_WEB_URL}/api/notion/page`;

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
// 3.
