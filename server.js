// server.js — local dev only (Vercel uses api/ functions + vercel.json instead).
// Run: npm start  ->  http://localhost:3000
import { createServer } from 'http';
import { readFile } from 'fs/promises';
import { extname, join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { getProvider } from './api/_providers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;

const MIME = {
  '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css',
  '.json': 'application/json', '.png': 'image/png', '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon'
};

function readBody(req) {
  return new Promise(resolve => {
    let d = '';
    req.on('data', c => (d += c));
    req.on('end', () => { try { resolve(JSON.parse(d || '{}')); } catch { resolve({}); } });
  });
}

const server = createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const path = url.pathname;

  // --- API: story ---
  if ((path === '/api/story' || path === '/story') && req.method === 'POST') {
    const b = await readBody(req);
    try {
      const p = getProvider(b.provider || 'claude');
      const text = await p.generateText({
        prompt: b.prompt, systemPrompt: b.systemPrompt || '',
        maxTokens: b.maxTokens || 1000, history: b.history || []
      });
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ text }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- API: image ---
  if ((path === '/api/image' || path === '/image') && req.method === 'POST') {
    const b = await readBody(req);
    try {
      const p = getProvider(b.provider || 'pollinations');
      const imgUrl = await p.generateImage(b.prompt, b.style || '');
      res.writeHead(200, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ url: imgUrl }));
    } catch (e) {
      res.writeHead(500, { 'content-type': 'application/json' });
      return res.end(JSON.stringify({ error: e.message }));
    }
  }

  // --- Static files (default to studio at /) ---
  const file = path === '/' ? '/webnovel-studio.html' : path;
  try {
    const full = join(__dirname, decodeURIComponent(file));
    const data = await readFile(full);
    res.writeHead(200, { 'content-type': MIME[extname(full)] || 'application/octet-stream' });
    return res.end(data);
  } catch {
    res.writeHead(404, { 'content-type': 'application/json' });
    return res.end(JSON.stringify({ error: 'Not found' }));
  }
});

server.listen(PORT, () => console.log(`Webnovel Studio → http://localhost:${PORT}`));
