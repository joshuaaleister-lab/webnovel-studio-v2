// api/story.js  ->  POST /api/story   (also reachable at /story via vercel.json)
const { getProvider } = require('./_providers.js');

async function getBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();

  if (req.method === 'GET') {
    return res.status(200).json({ ok: true, service: 'story', usage: 'POST { prompt, system, provider, maxTokens, history }' });
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const b = await getBody(req);
  const prompt = b.prompt;
  const provider = b.provider || 'claude';
  const systemPrompt = b.systemPrompt || b.system || '';   // accept either name
  const maxTokens = b.maxTokens || 1000;
  const history = b.history || [];

  if (!prompt) return res.status(400).json({ error: 'prompt required' });

  try {
    const p = getProvider(provider);
    const text = await p.generateText({ prompt, systemPrompt, maxTokens, history });
    return res.status(200).json({ text });
  } catch (err) {
    console.error('story error:', err);
    return res.status(500).json({ error: (err && err.message) || 'Story generation failed' });
  }
};
