import 'dotenv/config';
import axios from 'axios';

const NOTION_API_KEY = process.env.NOTION_API_KEY;
const NOTION_BASE = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

if (!NOTION_API_KEY) {
  console.warn('NOTION_API_KEY not set – Notion tools will fail until configured.');
}

const notionClient = axios.create({
  baseURL: NOTION_BASE,
  headers: {
    Authorization: `Bearer ${NOTION_API_KEY}`,
    'Notion-Version': NOTION_VERSION,
    'Content-Type': 'application/json'
  }
});

async function getPage(pageId) {
  if (!NOTION_API_KEY) {
    throw new Error('NOTION_API_KEY not configured');
  }

  const res = await notionClient.get(`/pages/${pageId}`);
  return res.data;
}

export {
  getPage
};