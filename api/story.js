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
const DEEPSEEK_MODEL = 'deepseek/deepseek-chat-v3-0324:free'; // OpenRouter retired this free slug too (now paid-only) — DeepSeek is removed from auto-fallback below so it never silently 404s or bills you
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
async function geminiText({ prompt, systemPrompt, maxTokens, history, key }) {
  const GEM = key || GEMINI_API_KEY;
  if (!GEM) throw new Error('No Gemini API key — paste your free key in the app (Get your free key link).');
  const contents = (history || []).map(m => ({ role: m.role === 'assistant' ? 'model' : 'user', parts: [{ text: typeof m.content === 'string' ? m.content : '' }] }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });
  const body = { contents, generationConfig: { maxOutputTokens: maxTokens || 1000, temperature: 0.95, topP: 0.97 } };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=' + GEM;
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
  const r = await fetch(endpoint, { method: 'POST', headers, body: JSON.stringify({ model, messages, max_tokens: maxTokens || 1000, temperature: 1.0, top_p: 0.97 }) });
  if (!r.ok) throw new Error(model + ' ' + r.status + ': ' + (await r.text()));
  const data = await r.json();
  return (data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content) || '';
}

// ---- Groq (free, fast) ----
async function groqText(opts) {
  const GK = opts.key || GROQ_API_KEY;
  if (!GK) throw new Error('No Groq API key — paste your free key in the app (Get your free key link).');
  return openaiChat('https://api.groq.com/openai/v1/chat/completions', GK, 'llama-3.3-70b-versatile', opts);
}

// ---- OpenRouter (free DeepSeek / Qwen) ----
async function openrouterText(model, opts) {
  const OR = opts.key || OPENROUTER_API_KEY;
  if (!OR) throw new Error('No OpenRouter API key — paste your key in the app.');
  return openaiChat('https://openrouter.ai/api/v1/chat/completions', OR, model, opts, { 'X-Title': 'Webnovel Studio' });
}

// ---- Claude (paid) ----
async function claudeText({ prompt, systemPrompt, maxTokens, history, key }) {
  const AK = key || ANTHROPIC_API_KEY;
  if (!AK) throw new Error('No Claude API key — paste your Anthropic key in the app.');
  const messages = [...(history || []), { role: 'user', content: prompt }];
  const r = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'content-type': 'application/json', 'x-api-key': AK, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: 'claude-sonnet-4-20250514', max_tokens: maxTokens || 1000, temperature: 1.0, ...(systemPrompt ? { system: systemPrompt } : {}), messages })
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
// Qwen AND DeepSeek free slugs are both dead on OpenRouter (retired to paid-only) — removed from the
// auto-fallback chain so a buyer on a "free" engine never gets silently routed into a 404 or a PAID call.
// Only Gemini and Groq remain genuinely free. If OpenRouter ever restores a free slug, add it back here.
const FREE_ORDER = ['gemini', 'groq'];

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
    // BYOK: the buyer's own API key travels with the request and is used ahead of any server env key.
    const opts = { prompt, systemPrompt: b.systemPrompt || b.system || '', maxTokens: b.maxTokens || 1000, history: b.history || [], key: b.apiKey || '' };

    // Build the attempt chain. Claude (paid) never auto-falls back.
    // lockEngine: skip auto-fallback and fail loudly instead of silently switching models.
    // BYOK: a buyer key only works for its own provider, so never fall back to a different engine.
    let chain;
    if (requested === 'claude' || b.lockEngine || b.apiKey) {
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
