// api/story.js  ->  POST /api/story   (self-contained: Gemini, Groq, Claude)
const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';
const GROQ_API_KEY = process.env.GROQ_API_KEY || '';

async function readBody(req) {
  if (req.body && typeof req.body === 'object') return req.body;
  if (typeof req.body === 'string') { try { return JSON.parse(req.body); } catch { return {}; } }
  return await new Promise((resolve) => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
    req.on('error', () => resolve({}));
  });
}

// ---- Gemini (free tier) ----
async function geminiText({ prompt, systemPrompt, maxTokens, history }) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in Vercel environment variables');
  const contents = (history || []).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : '' }] }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens || 1000 } };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Gemini API ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map(p => p.text || '').join('\n');
}

// ---- Groq (free, fast: Llama 3.3 70B) ----
async function groqText({ prompt, systemPrompt, maxTokens, history }) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in Vercel environment variables');
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const m of (history || [])) messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : '' });
  messages.push({ role: 'user', content: prompt });
  const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'authorization': 'Bearer ' + GROQ_API_KEY },
    body: JSON.stringify({ model: 'llama-3.3-70b-versatile', messages, max_tokens: maxTokens || 1000 })
  });
  if (!r.ok) throw new Error('Groq API ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

// ---- Claude (paid) ----
async function claudeText({ prompt, systemPrompt, maxTokens, history }) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in Vercel environment variables');
  const messages = [...(history || []), { role: 'user', content: prompt }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': ANTHROPIC_API_KEY, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens || 1000, ...(systemPrompt ? { system: systemPrompt } : {}), messages })
  });
  if (!r.ok) throw new Error('Claude API ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

const PROVIDERS = { gemini: geminiText, groq: groqText, claude: claudeText };

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'story', providers: Object.keys(PROVIDERS) });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = await readBody(req);
    const prompt = b.prompt;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const provider = (b.provider || 'gemini').toLowerCase();
    const systemPrompt = b.systemPrompt || b.system || '';
    const maxTokens = b.maxTokens || 1000;
    const history = b.history || [];
    const fn = PROVIDERS[provider] || geminiText;
    const text = await fn({ prompt, systemPrompt, maxTokens, history });
    return res.status(200).json({ text });
  } catch (err) {
    return res.status(500).json({ error: (err && err.message) || 'Story generation failed' });
  }
};
