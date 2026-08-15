# Trnscrpt

A fast, free, no-signup transcript generator for public YouTube, Facebook,
Instagram, TikTok, and Pinterest videos.

## What's in this project

- **`frontend/index.html`** — the complete, working UI, fully wired to the
  backend API: homepage, URL validation, a processing screen that polls
  real job status, results page (transcript panel, copy/TXT/SRT/PDF,
  translation selector, summary), About/How It Works/Contact/Privacy/Terms
  pages, ad slots, and footer. Self-contained (no build step) — open it
  directly in a browser. It calls `POST /api/transcripts`, polls
  `GET /api/transcripts/:jobId/status`, then fetches the full result and
  drives translate/summary/export off the corresponding endpoints. No
  mock data remains.

- **`backend/`** — a real, deployable Node.js/Express + BullMQ backend
  implementing the architecture in the spec: URL validation and SSRF
  protection, safe `yt-dlp` invocation, a Whisper-compatible transcription
  service, translation and summary services, TXT/SRT/PDF export, a
  Postgres-backed job system with polling, Redis-backed daily rate
  limiting, and security middleware. See `backend/README.md` for setup,
  environment variables, deployment, and API docs.

## Connecting the two

The frontend already talks to the API — you just need to point it at a
real, deployed backend:

1. Deploy `backend/` with real credentials for a transcription provider
   (required), and optionally a translation provider and an LLM for
   summaries — see `backend/README.md` sections 1–4.
2. In `frontend/index.html`, find the small `<script>` block in `<head>`
   and set `window.TRNSCRPT_API_BASE_URL` to your deployed backend's URL
   (e.g. `https://api.trnscrpt.com`). That's the only change needed.
3. Make sure the backend's `PUBLIC_APP_URL` env var matches wherever
   you're hosting `index.html`, since the backend's CORS policy only
   allows that origin.
4. Swap the ad slot `<div class="ad-slot">` elements for your ad network's
   snippet once you have one — they're already isolated, responsive
   components positioned per the spec (banner after the transcript,
   in-content slot below it, away from the action buttons).

Until step 1 is done (a live backend with a transcription API key), the
homepage's "Get Transcript" button will show a friendly "we couldn't
reach the server" error — that's expected, not a bug in the frontend.

## Design notes

Visual system follows the brief's Evernote-inspired direction: near-white
background, dark charcoal text, muted gray secondary text, a single
professional green accent, soft borders, subtle shadows, rounded (not
pill-shaped) buttons, and one consistent sans-serif type family. The one
deliberate signature touch is the transcript panel itself — each segment's
timestamp sits in a small accent-colored pill, so the "receipt" of exactly
what was said and when is the most distinctive visual element on the page,
which is fitting for a transcript tool.
