# Kitchen Guardian

Kitchen Guardian is a home-kitchen assistant. It tracks what is in the kitchen, what is running low
or missing, warns before food expires, and uses AI to suggest what to cook and whether food is
still safe to eat. It can also read a grocery bill or shelf photo and add items automatically.

This is the self-hosted version: a small Node.js server plus a single-page web app, using **Groq**
for the AI features instead of running inside Claude.

## Features

- **Kitchen list** — every item is marked Have, Low or Out, grouped into Staples, Spices, Oils &
  sauces, Fresh, Dairy and Essentials.
- **To buy** — automatically built from anything marked Low or Out. Tap an item to mark it bought.
- **Expiry warnings** — set a date on any item; anything expiring within 3 days shows under "Use
  these first".
- **Going out?** — a pick-up-before-you-leave list of everything Low or Out, with an option to show
  it automatically whenever the app is opened.
- **Ask AI**
  - *What can I cook?* — suggests three dishes for a chosen meal, built from what is in stock,
    preferring items that expire soonest, and listing what's missing.
  - *Is it still safe to eat?* — answers Safe / Not safe / Depends for a described food, with a
    short reason and what to do.
- **Photo scan** — takes a photo of a bill or a shelf/fridge and lists the food items it recognizes,
  so they can be added in one tap.

Everything except the AI calls runs entirely in the browser; the kitchen list is stored in that
browser's local storage.

## Project structure

```
kitchen-guardian-app/
├── server.js              Express server: serves the app, proxies AI requests to Groq
├── package.json
├── .env.example           Copy to .env and add your Groq API key
├── .gitignore              Excludes node_modules/ and .env
└── public/
    ├── index.html          The whole app: markup, styles and client-side logic in one file
    └── claude-shim.js       Provides window.claude.use("sample") by calling this server's /api/ask
```

`index.html` was originally built to run inside Claude, where the browser gets a built-in
`window.claude` object for asking Claude directly. `claude-shim.js` recreates the same small
interface (`window.claude.use("sample")`) so the page's code did not need to change — it just
calls `/api/ask` on this server instead.

## How a request flows

1. The page calls `window.claude.use("sample")`, which `claude-shim.js` provides.
2. The shim sends a `POST /api/ask` request to this server with the prompt (and a resized photo,
   for the scan feature).
3. `server.js` calls Groq's chat API with your `GROQ_API_KEY`, which never leaves the server.
4. The reply's text goes back to the browser, and the shim returns it in the shape the page
   expects (or throws the matching error code, e.g. `rate_limited`, `invalid_json`).

Text requests use `GROQ_MODEL` (default `llama-3.3-70b-versatile`); the photo-scan request uses
`GROQ_VISION_MODEL` (default `meta-llama/llama-4-scout-17b-16e-instruct`) because it needs to see
the image.

## Setup

Requires Node.js 18 or newer.

```bash
npm install
cp .env.example .env
# open .env and paste your key after GROQ_API_KEY=
npm start
```

Then open http://localhost:3000. Without a key in `.env`, the app still runs — the kitchen list,
shopping list, expiry warnings and going-out list all work — but the three AI helpers stay
switched off, and the terminal prints "AI helpers: OFF".

Get a free Groq API key at https://console.groq.com/keys.

### Environment variables (`.env`)

| Variable            | Required | Default                                        |
|---------------------|----------|-------------------------------------------------|
| `GROQ_API_KEY`       | Yes (for AI features) | — |
| `GROQ_MODEL`         | No       | `llama-3.3-70b-versatile`                       |
| `GROQ_VISION_MODEL`  | No       | `meta-llama/llama-4-scout-17b-16e-instruct`     |
| `PORT`               | No       | `3000`                                          |

## Security notes

- `.env` is listed in `.gitignore` — never commit your API key. If you ever do, revoke it at
  console.groq.com and issue a new one.
- `server.js` limits each visitor to 20 AI requests per minute, so a shared link can't run up your
  Groq usage on its own.
- The app has no login. Anyone with the URL can use the kitchen list and, if a key is set, the AI
  features. Add authentication before hosting this anywhere public.

## Deploying

Any Node-friendly host works (Render, Railway, Azure App Service, a VPS, etc.). Set the same
environment variables there instead of a local `.env` file, run `npm install` then `npm start`
(or let the platform run your `start` script), and make sure the platform exposes the port from
`PORT` (most platforms set this automatically).

## Credits

Built as a personal project exploring an AI-powered home-kitchen assistant.
