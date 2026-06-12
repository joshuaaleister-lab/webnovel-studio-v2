// api/_providers.js  (CommonJS — maximally compatible with Vercel)
// Node 18+ (global fetch). Required by api/story.js and api/image.js.

const ANTHROPIC_API_KEY = process.env.ANTHROPIC_API_KEY || '';
const GEMINI_API_KEY = process.env.GEMINI_API_KEY || '';

async function claudeText({ prompt, systemPrompt = '', maxTokens = 1000, history = [] }) {
  if (!ANTHROPIC_API_KEY) throw new Error('ANTHROPIC_API_KEY not set in Vercel environment variables');
  const messages = [...history, { role: 'user', content: prompt }];
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-20250514',
      max_tokens: maxTokens,
      ...(systemPrompt ? { system: systemPrompt } : {}),
      messages
    })
  });
  if (!res.ok) throw new Error('Claude API ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  return (data.content || []).filter(b => b.type === 'text').map(b => b.text).join('\n');
}

async function geminiText({ prompt, systemPrompt = '', maxTokens = 1000, history = [] }) {
  if (!GEMINI_API_KEY) throw new Error('GEMINI_API_KEY not set in Vercel environment variables');
  const contents = (history || []).map(m => ({
    role: m.role === 'assistant' ? 'model' : 'user',
    parts: [{ text: typeof m.content === 'string' ? m.content : '' }]
  }));
  contents.push({ role: 'user', parts: [{ text: prompt }] });

  const body = { contents, generationConfig: { maxOutputTokens: maxTokens } };
  if (systemPrompt) body.systemInstruction = { parts: [{ text: systemPrompt }] };

  const model = 'gemini-2.0-flash';
  const url = 'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent?key=' + GEMINI_API_KEY;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body)
  });
  if (!res.ok) throw new Error('Gemini API ' + res.status + ': ' + (await res.text()));
  const data = await res.json();
  const parts = (data && data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [];
  return parts.map(p => p.text || '').join('\n');
}

async function pollinationsImage(prompt, style = '') {
  const full = style ? (prompt + ', ' + style) : prompt;
  const seed = Math.floor(Math.random() * 1e9);
  return 'https://image.pollinations.ai/prompt/' + encodeURIComponent(full) +
    '?width=1024&height=576&nologo=true&seed=' + seed + '&model=flux';
}

const TEXT = { claude: claudeText, gemini: geminiText };
const IMAGE = { pollinations: pollinationsImage };

function getProvider(name) {
  const key = String(name || 'claude').toLowerCase();
  return {
    generateText: (opts) => (TEXT[key] || TEXT.claude)(opts),
    generateImage: (prompt, style) => (IMAGE[key] || IMAGE.pollinations)(prompt, style)
  };
}

module.exports = { getProvider };
