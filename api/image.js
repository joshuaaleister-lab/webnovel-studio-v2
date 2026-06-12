// api/image.js  ->  POST /api/image   (self-contained, no external imports)
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

module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, GET, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method === 'GET') return res.status(200).json({ ok: true, service: 'image' });
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const b = await readBody(req);
    const prompt = b.prompt;
    if (!prompt) return res.status(400).json({ error: 'prompt required' });
    const style = b.style || '';
    const full = style ? (prompt + ', ' + style) : prompt;
    const seed = Math.floor(Math.random() * 1e9);
    const url = 'https://image.pollinations.ai/prompt/' + encodeURIComponent(full) +
      '?width=1024&height=576&nologo=true&seed=' + seed + '&model=flux';
    return res.status(200).json({ url });
  } catch (err) {
    return res.status(500).json({ error: (err && err.message) || 'Image generation failed' });
  }
};
