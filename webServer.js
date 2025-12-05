import 'dotenv/config';
import express from 'express';
import { upsertVectors, queryVectors } from './src/services/pineconeService.js';
import { getPage as notionGetPage } from './src/services/notionService.js';
import cors from "cors";

const app = express();

// 🔑 Allow Framer (and others) to call your API from the browser
app.use(cors());
app.use(express.json());
// Render will set PORT; fall back to WEB_SERVER_PORT or 4000
const port = process.env.PORT || process.env.WEB_SERVER_PORT || 4000;

/* --------------------------------------------------
 * 1) REST API for your website
 * -------------------------------------------------- */

app.get("/api/data", (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");

  const data = {
    items: [
      { id: 1, title: "First item", description: "Hello from the API" },
      { id: 2, title: "Second item", description: "More sample data" },
    ],
  };

  res.json(data);
});


// POST /api/pinecone/search
app.post('/api/pinecone/search', async (req, res) => {
  try {
    const { vector, topK, indexName, filter } = req.body;

    if (!Array.isArray(vector)) {
      return res.status(400).json({ ok: false, error: 'vector must be an array of numbers' });
    }

    const result = await queryVectors(vector, topK, indexName, filter);
    res.json(result);
  } catch (err) {
    console.error('Error /api/pinecone/search:', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

// POST /api/pinecone/upsert
app.post('/api/pinecone/upsert', async (req, res) => {
  try {
    const { vectors, indexName } = req.body;

    if (!Array.isArray(vectors)) {
      return res.status(400).json({ ok: false, error: 'vectors must be an array' });
    }

    const result = await upsertVectors(vectors, indexName);
    res.json(result);
  } catch (err) {
    console.error('Error /api/pinecone/upsert:', err);
    res.status(500).json({ ok: false, error: err.message || String(err) });
  }
});

/* --------------------------------------------------
 * 2) Generic "MCP-style" tool router for ChatGPT
 *    POST /mcp/tools/call
 *    body: { name: string, arguments: object }
 * -------------------------------------------------- */

const tools = {
  // pinecone_query tool
  async pinecone_query(args) {
    const { vector, topK, indexName, filter } = args;
    if (!Array.isArray(vector)) {
      throw new Error('vector must be an array of numbers');
    }
    const result = await queryVectors(vector, topK, indexName, filter);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  },

  // pinecone_upsert tool
  async pinecone_upsert(args) {
    const { vectors, indexName } = args;
    if (!Array.isArray(vectors)) {
      throw new Error('vectors must be an array');
    }
    const result = await upsertVectors(vectors, indexName);
    return {
      content: [{ type: 'text', text: JSON.stringify(result, null, 2) }]
    };
  },

  // notion_get_page tool
  async notion_get_page(args) {
    const { pageId } = args;
    if (!pageId) {
      throw new Error('pageId is required');
    }
    const page = await notionGetPage(pageId);
    return {
      content: [{ type: 'text', text: JSON.stringify(page, null, 2) }]
    };
  }
};

// Single endpoint that can call any tool above
app.post('/mcp/tools/call', async (req, res) => {
  try {
    const { name, arguments: args } = req.body || {};
    if (!name) {
      return res.status(400).json({ error: 'Missing "name" in request body' });
    }

    const tool = tools[name];
    if (!tool) {
      return res.status(404).json({ error: `Tool "${name}" not found` });
    }

    const result = await tool(args || {});
    res.json(result);
  } catch (err) {
    console.error('Error /mcp/tools/call:', err);
    res.status(500).json({ error: err.message || String(err) });
  }
});

/* -------------------------------------------------- */

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log("Server listening on port", PORT);
});