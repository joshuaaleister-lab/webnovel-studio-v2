// api/story.js  ->  POST /api/story
// Engines: Gemini, Groq, DeepSeek & Qwen (via OpenRouter), Claude.
// Auto-fallback: if a FREE engine is rate-limited/errors, it automatically
// tries the other free engines that have keys before giving up.

const ANTHROPIC_API_KEY  = process.env.ANTHROPIC_API_KEY  || '';
const GEMINI_API_KEY     = process.env.GEMINI_API_KEY     || '';
const GROQ_API_KEY       = process.env.GROQ_API_KEY       || '';
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || '';

// OpenRouter free model slugs — if one is ever retired, swap it here.
// Browse current free models at https://openrouter.ai/models?max_price=0
const DEEPSEEK_MODEL = 'deepseek/deepseek-chat-v3-0324:free';
const QWEN_MODEL     = 'qwen/qwen-2.5-72b-instruct:free'; // OpenRouter retired this free slug (now paid-only) — Qwen is disabled below, not auto-fallen-back-into, so buyers on "free" engines are never silently charged

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

// ---- Gemini (free) ----
async function geminiText({ prompt, systemPrompt, maxTokens, history }) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in Vercel environment variables');
  const contents = (history || []).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : '' }] }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens || 1000 } };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEMINI_API_KEY;
  const r = await fetch(url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
  if (!r.ok) throw new Error('Gemini ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map(p => p.text || '').join('\n');
}

// shared OpenAI-compatible chat caller (Groq + OpenRouter)
async function openaiChat(endpoint, key, model, { prompt, systemPrompt, maxTokens, history }, extraHeaders) {
  const messages = [];
  if (systemPrompt) messages.push({ role: 'system', content: systemPrompt });
  for (const m of (history || [])) messages.push({ role: m.role === 'assistant' ? 'assistant' : 'user', content: typeof m.content === 'string' ? m.content : '' });
  messages.push({ role: 'user', content: prompt });
  const headers = Object.assign({ 'content-type': 'application/json', 'authorization': 'Bearer ' + key }, extraHeaders || {});
  const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ model, messages, max_tokens: maxTokens || 1000 }) });
  if (!r.ok) throw new Error(model + ' ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

// ---- Groq (free, fast) ----
async function groqText(opts) {
  if (!GROQ_API_KEY) throw new Error('GROQ_API_KEY not set in Vercel environment variables');
  return openaiChat('https://api.groq.com/openai/v1/chat/completions', GROQ_API_KEY, 'llama-3.3-70b-versatile', opts);
}

// ---- OpenRouter (free DeepSeek / Qwen) ----
async function openrouterText(model, opts) {
  if (!OPENROUTER_API_KEY) throw new Error('OPENROUTER_API_KEY not set in Vercel environment variables');
  return openaiChat('https://openrouter.ai/api/v1/chat/completions', OPENROUTER_API_KEY, model, opts, { 'X-Title': 'Webnovel Studio' });
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
  if (!r.ok) throw new Error('Claude ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

const PROVIDERS = {
  gemini:   geminiText,
  groq:     groqText,
  deepseek: (o) => openrouterText(DEEPSEEK_MODEL, o),
  qwen:     (o) => openrouterText(QWEN_MODEL, o), // kept only so a user who explicitly picks Qwen gets a clear "retired" error, not a silent charge
  claude:   claudeText
};
// Qwen's free slug is dead on OpenRouter — removed from the auto-fallback chain so a buyer on a "free" engine
// never gets silently routed into it (which would now be a PAID call on your OpenRouter balance).
const FREE_ORDER = ['gemini', 'groq', 'deepseek'];

function hasKey(p) {
  if (p === 'gemini') return !!GEMINI_API_KEY;
  if (p === 'groq') return !!GROQ_API_KEY;
  if (p === 'deepseek' || p === 'qwen') return !!OPENROUTER_API_KEY;
  if (p === 'claude') return !!ANTHROPIC_API_KEY;
  return false;
}

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
    const requested = (b.provider || 'gemini').toLowerCase();
    const opts = { prompt, systemPrompt: b.systemPrompt || b.system || '', maxTokens: b.maxTokens || 1000, history: b.history || [] };

    // Build the attempt chain. Claude (paid) never auto-falls back.
    // lockEngine: the frontend can ask to skip auto-fallback entirely — fail loudly instead of
    // silently substituting a different model, so a long book's voice doesn't drift chapter to chapter.
    let chain;
    if (requested === 'claude' || b.lockEngine) {
      chain = [requested];
    } else {
      chain = [requested, ...FREE_ORDER.filter(p => p !== requested)].filter(p => PROVIDERS[p] && hasKey(p));
      if (chain.length === 0) chain = [requested]; // surfaces a clear "key not set" error
    }

    let lastErr;
    for (const p of chain) {
      try {
        const text = await PROVIDERS[p](opts);
        if (text && text.trim()) return res.status(200).json({ text, used: p });
        lastErr = new Error('Empty response from ' + p);
      } catch (e) {
        lastErr = e; // try the next free engine
      }
    }
    return res.status(500).json({ error: (lastErr && lastErr.message) || 'Story generation failed' });
  } catch (err) {
    return res.status(500).json({ error: (err && err.message) || 'Story generation failed' });
  }
};
