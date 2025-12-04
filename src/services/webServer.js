require('dotenv').config();
const express = require('express');
const { upsertVectors, queryVectors } = require('./services/pineconeService');
const { getPage: notionGetPage } = require('./services/notionService');

const app = express();
app.use(express.json());

// Render will set PORT; fall back to WEB_SERVER_PORT or 4000
const port = process.env.PORT || process.env.WEB_SERVER_PORT || 4000;

/* --------------------------------------------------
 * 1) REST API for your website
 * -------------------------------------------------- */

app.get('/', (req, res) => {
  res.json({ ok: true, message: 'Universal Adapter running' });
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

app.listen(port, () => {
  console.log(`Universal Adapter listening on http://localhost:${port}`);
});