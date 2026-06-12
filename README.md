# Webnovel Studio — Backend + Deploy Config

These files make the project deploy correctly on **Vercel** (static HTML + serverless API).
Your `webnovel-studio.html` and `story-director.html` stay as they are — don't replace them.

## Files
- `vercel.json` — tells Vercel to serve HTML statically and run `api/*.js` as functions. **This is the fix.**
- `api/_providers.js` — Claude + Gemini (text), Pollinations (free images, no key).
- `api/story.js` — `POST /api/story` → text.
- `api/image.js` — `POST /api/image` → image URL.
- `server.js` — local dev server (mirrors the Vercel routes).
- `package.json` — ESM, Node 18+.

## Endpoints
- `POST /api/story`  body: `{ prompt, provider:"claude"|"gemini", systemPrompt, maxTokens, history }` → `{ text }`
- `POST /api/image`  body: `{ prompt, provider:"pollinations", style }` → `{ url }`

`/story` and `/image` also work (aliased to the `/api/...` routes).

## Deploy (GitHub → Vercel)
1. Upload these files to your `webnovel-studio` repo (keep your HTML files).
   - `vercel.json`, `package.json`, `server.js`, `README.md` at the root.
   - `_providers.js`, `story.js`, `image.js` inside the `api/` folder.
2. In Vercel: **Project → Settings → Environment Variables**, add:
   - `ANTHROPIC_API_KEY` = your Claude key
   - `GEMINI_API_KEY` = your Gemini key
3. Vercel auto-redeploys on commit. The app loads at the project's root URL.

## Run locally
```bash
npm start
# http://localhost:3000
```
