require('dotenv').config();
const { Pinecone } = require('@pinecone-database/pinecone');

const apiKey = process.env.PINECONE_API_KEY;
const environment = process.env.PINECONE_ENVIRONMENT;
const defaultIndexName = process.env.PINECONE_INDEX_NAME;

if (!apiKey) {
  throw new Error('PINECONE_API_KEY is not set in environment');
}

if (!environment) {
  throw new Error('PINECONE_ENVIRONMENT is not set in environment');
}

// Create Pinecone client
const pc = new Pinecone({ apiKey, environment });

// Upsert vectors
async function upsertVectors(vectors, indexName) {
  const name = indexName || defaultIndexName;
  if (!name) throw new Error('No index name provided and PINECONE_INDEX_NAME not set');

  const index = pc.index(name);

  await index.upsert({
    vectors: vectors.map(v => ({
      id: v.id,
      values: v.values,
      metadata: v.metadata || {}
    }))
  });

  return { ok: true, count: vectors.length };
}

// Query vectors
async function queryVectors(vector, topK = 5, indexName, filter) {
  const name = indexName || defaultIndexName;
  if (!name) throw new Error('No index name provided and PINECONE_INDEX_NAME not set');

  const index = pc.index(name);

  const result = await index.query({
    vector,
    topK,
    includeValues: false,
    includeMetadata: true,
    filter
  });

  return {
    ok: true,
    matches: result.matches || []
  };
}

module.exports = {
  upsertVectors,
  queryVectors
};
