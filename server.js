'use strict';
/*
  Kitchen Guardian server.
  - Serves the web app from ./public
  - POST /api/ask    -> asks Groq (text, or text + one photo) and returns the reply
  - GET  /api/health -> tells the page whether the AI helpers are switched on

  Your Groq API key stays here on the server (in .env). It is never sent to the browser.
  Groq's chat API is OpenAI-compatible, so this uses plain fetch - no extra SDK needed.
*/
require('dotenv').config();
const path = require('path');
const express = require('express');

const PORT = Number(process.env.PORT) || 3000;
const TEXT_MODEL = process.env.GROQ_MODEL || 'llama-3.3-70b-versatile';
const VISION_MODEL = process.env.GROQ_VISION_MODEL || 'meta-llama/llama-4-scout-17b-16e-instruct';
const KEY = (process.env.GROQ_API_KEY || '').trim();
const GROQ_URL = 'https://api.groq.com/openai/v1/chat/completions';

const app = express();
app.use(express.json({ limit: '8mb' }));

// Simple per-IP limit so a shared link cannot burn through your API credit.
const WINDOW_MS = 60 * 1000;
const MAX_PER_WINDOW = 20;
const hits = new Map();
function limiter(req, res, next) {
  const now = Date.now();
  const recent = (hits.get(req.ip) || []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_PER_WINDOW) {
    return res.status(429).json({ code: 'rate_limited', message: 'Too many requests. Wait a minute and try again.' });
  }
  recent.push(now);
  hits.set(req.ip, recent);
  next();
}

app.get('/api/health', (req, res) => {
  res.json({ ai: Boolean(KEY), model: TEXT_MODEL });
});

app.post('/api/ask', limiter, async (req, res) => {
  if (!KEY) {
    return res.status(503).json({ code: 'sampling_disabled', message: 'GROQ_API_KEY is not set on the server.' });
  }
  const { prompt, image, json } = req.body || {};
  if (typeof prompt !== 'string' || !prompt.trim() || prompt.length > 20000) {
    return res.status(400).json({ code: 'invalid_request', message: 'The prompt is missing or too long.' });
  }

  var userContent;
  var model = TEXT_MODEL;
  if (image) {
    const m = /^data:(image\/(?:jpeg|png|webp));base64,(.+)$/.exec(String(image));
    if (!m) return res.status(400).json({ code: 'image_rejected', message: 'Unsupported image.' });
    model = VISION_MODEL; // only the vision model can look at the photo
    userContent = [
      { type: 'text', text: prompt },
      { type: 'image_url', image_url: { url: image } },
    ];
  } else {
    userContent = prompt;
  }

  const system = json
    ? 'You are a data helper for a home-kitchen app. Reply with only valid JSON. No commentary, no code fences, no explanation.'
    : 'You are a concise, practical home-kitchen helper.';

  try {
    const r = await fetch(GROQ_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + KEY },
      body: JSON.stringify({
        model: model,
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: userContent },
        ],
        max_tokens: 2000,
        response_format: json ? { type: 'json_object' } : undefined,
      }),
    });
    const data = await r.json();
    if (!r.ok) {
      console.error('Groq API error:', r.status, data && data.error && data.error.message);
      const code = r.status === 429 ? 'rate_limited' : r.status === 401 ? 'sampling_disabled' : 'upstream_error';
      return res.status(r.status).json({ code: code, message: (data && data.error && data.error.message) || 'Groq request failed.' });
    }
    const choice = data.choices && data.choices[0];
    const text = choice && choice.message && choice.message.content ? choice.message.content.trim() : '';
    if (!text) return res.status(502).json({ code: 'empty_completion', message: 'Groq returned no text.' });
    res.json({ text: text, truncated: choice.finish_reason === 'length' });
  } catch (err) {
    console.error('Groq request failed:', err.message);
    res.status(500).json({ code: 'upstream_error', message: err.message });
  }
});

app.use(express.static(path.join(__dirname, 'public')));

app.listen(PORT, () => {
  console.log(`Kitchen Guardian is running at http://localhost:${PORT}`);
  console.log(KEY ? `AI helpers: ON (text model ${TEXT_MODEL}, vision model ${VISION_MODEL})` : 'AI helpers: OFF. Add GROQ_API_KEY to a .env file, then restart.');
});
