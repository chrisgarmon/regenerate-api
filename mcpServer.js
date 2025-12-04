/*
 * MCP Server (SSE)
 *
 * This file implements a minimal Model Context Protocol (MCP) server using
 * Server‑Sent Events (SSE).  It exposes a list of available tools and allows
 * ChatGPT to invoke them by sending POST requests to `/tools/call`.  Results
 * are streamed back to the client via the `/sse` endpoint.  Both your
 * website and ChatGPT can reuse the underlying service functions defined in
 * `src/services/`.
 */

require('dotenv').config();
const express = require('express');
const { upsertVectors, queryVectors } = require('./src/services/pineconeService');
const { getPage: notionGetPage } = require('./src/services/notionService');

const app = express();
app.use(express.json());

// List of connected SSE clients.  Each entry contains an id and the
// corresponding response object.  When a tool returns a result, we write
// an SSE event to every connected client.
let clients = [];

// Tool definitions.  These objects are returned from `/tools/list` and
// describe the name, description and JSON schema for the tool arguments.
const tools = [
  {
    name: 'pinecone_query',
    description: 'Query a Pinecone index with a vector',
    inputSchema: {
      type: 'object',
      properties: {
        vector: { type: 'array', items: { type: 'number' } },
        topK: { type: 'number' },
        indexName: { type: 'string' },
        filter: { type: 'object' }
      },
      required: ['vector', 'topK']
    }
  },
  {
    name: 'pinecone_upsert',
    description: 'Upsert vectors into Pinecone',
    inputSchema: {
      type: 'object',
      properties: {
        vectors: {
          type: 'array',
          items: {
            type: 'object',
            properties: {
              id: { type: 'string' },
              values: { type: 'array', items: { type: 'number' } },
              metadata: { type: 'object' }
            },
            required: ['id', 'values']
          }
        },
        indexName: { type: 'string' }
      },
      required: ['vectors']
    }
  },
  {
    name: 'notion_get_page',
    description: 'Fetch a Notion page by ID',
    inputSchema: {
      type: 'object',
      properties: {
        pageId: { type: 'string' }
      },
      required: ['pageId']
    }
  }
];

/**
 * Send an event to all connected SSE clients.  The event is JSON encoded
 * and sent with the `data:` prefix required by SSE.  Each write ends with
 * double newline to flush the event to the client.
 *
 * @param {object} payload
 */
function broadcastEvent(payload) {
  const data = JSON.stringify(payload);
  clients.forEach((client) => {
    try {
      client.res.write(`data: ${data}\n\n`);
    } catch (err) {
      // Ignore write errors – the cleanup in the `close` handler will remove
      // dead clients.
    }
  });
}

// SSE endpoint.  Clients (e.g. ChatGPT) connect here to receive events.
app.get('/sse', (req, res) => {
  // Set required headers for SSE.  Note: connection should remain open.
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.flushHeaders();

  // Assign an id to the client and store the response object.
  const clientId = Date.now();
  const client = { id: clientId, res };
  clients.push(client);

  // Notify the client that the server is ready.
  res.write(`data: ${JSON.stringify({ type: 'server_ready' })}\n\n`);

  // When the client disconnects, remove it from the list.
  req.on('close', () => {
    clients = clients.filter((c) => c.id !== clientId);
  });
});

// Return the list of available tools.  This endpoint is used by MCP
// clients to discover what functions they can call.
app.get('/tools/list', (_req, res) => {
  const formatted = tools.map((t) => ({
    name: t.name,
    description: t.description,
    input_schema: t.inputSchema
  }));
  res.json({ tools: formatted });
});

// Invoke a tool.  The request body should include an `id` (used by
// ChatGPT to correlate responses), a `name` (tool name), and an
// `arguments` object containing the tool's input.  Results are
// broadcast back over SSE.
app.post('/tools/call', async (req, res) => {
  const { id, name, arguments: args } = req.body || {};
  if (!name) {
    return res.status(400).json({ error: 'Missing tool name' });
  }
  let resultPayload;
  try {
    let result;
    switch (name) {
      case 'pinecone_query': {
        const { vector, topK, indexName, filter } = args || {};
        result = await queryVectors(vector, topK, indexName, filter);
        break;
      }
      case 'pinecone_upsert': {
        const { vectors, indexName } = args || {};
        result = await upsertVectors(vectors, indexName);
        break;
      }
      case 'notion_get_page': {
        const { pageId } = args || {};
        result = await notionGetPage(pageId);
        break;
      }
      default:
        throw new Error(`Unknown tool: ${name}`);
    }
    resultPayload = {
      id,
      name,
      status: 'success',
      result
    };
    // Broadcast success over SSE
    broadcastEvent(resultPayload);
    res.json({ ok: true });
  } catch (err) {
    resultPayload = {
      id,
      name,
      status: 'error',
      error: err.message || String(err)
    };
    // Broadcast error over SSE
    broadcastEvent(resultPayload);
    res.status(500).json({ error: err.message || String(err) });
  }
});

// Health check route.  Returns OK and indicates that the MCP server is
// running.  Useful for service monitoring.
app.get('/', (_req, res) => {
  res.json({ ok: true, message: 'MCP server is running' });
});

// Start the server on the configured port.  When deploying to Render, the
// environment will set PORT automatically.  Locally, default to 9000.
const port = process.env.PORT || process.env.MCP_SERVER_PORT || 9000;
app.listen(port, () => {
  console.log(`MCP server listening on port ${port}`);
});