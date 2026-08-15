# Trnscrpt Backend

API and background worker for Trnscrpt — a no-signup video transcript generator
for YouTube, Facebook, Instagram, TikTok, and Pinterest.

## 1. Installation

Requirements:
- Node.js 18.18+
- PostgreSQL 14+
- Redis 6+
- [`yt-dlp`](https://github.com/yt-dlp/yt-dlp) installed on the worker host (`pip install yt-dlp` or a static binary), plus `ffmpeg` for audio extraction

```bash
cd backend
npm install
cp .env.example .env
```

## 2. Environment variables

See `.env.example`. Key ones:

| Variable | Purpose |
|---|---|
| `DATABASE_URL` | Postgres connection string for job metadata |
| `REDIS_URL` | Redis for the BullMQ job queue and rate-limit counters |
| `TRANSCRIPTION_API_URL` / `TRANSCRIPTION_API_KEY` | Whisper-compatible speech-to-text provider |
| `TRANSLATION_API_URL` / `TRANSLATION_API_KEY` | Translation provider |
| `SUMMARY_API_URL` / `SUMMARY_API_KEY` | LLM provider for summaries (defaults to Anthropic's Messages API shape) |
| `STORAGE_*` | Object storage for temp audio (only needed if you extend the worker to persist audio instead of using local temp dirs) |
| `FREE_DAILY_LIMIT` | Anonymous transcripts per IP per day (default 5) |
| `MAX_MEDIA_DURATION_SECONDS`, `MAX_MEDIA_FILE_SIZE_MB` | Extraction limits |
| `JOB_EXPIRY_HOURS` | How long a completed job's result stays retrievable |

No secrets are ever sent to the frontend — the browser only ever talks to
this API, never directly to the transcription/translation/summary providers.

## 3. Development setup

Two processes run side by side:

```bash
# Terminal 1 — API server
npm run dev

# Terminal 2 — queue worker (does the actual extraction + transcription)
npm run worker
```

The API returns immediately after queuing a job; all the slow work
(audio extraction, transcription) happens in the worker process so a slow
video never blocks the HTTP server.

## 4. Production deployment

- Run the API (`npm start`) and worker (`npm run worker`) as separate
  processes/containers so you can scale worker concurrency independently
  of API traffic.
- Put the API behind a reverse proxy (nginx / your platform's load
  balancer) terminating HTTPS.
- Run `node src/queue/expireJobs.js` on a schedule (cron, every 15 min) to
  mark old jobs expired; pair it with a storage lifecycle rule to delete
  any leftover temp audio.
- Make sure the worker host has `yt-dlp` and `ffmpeg` installed and kept
  up to date — platform extraction breaks periodically as sites change,
  and yt-dlp ships frequent fixes.

## 5. Queue worker setup

The worker (`src/queue/worker.js`) consumes the `transcript-jobs` BullMQ
queue with concurrency 3 by default (`{ connection, concurrency: 3 }` in
that file) — tune based on your CPU/bandwidth budget, since audio
extraction and upload to the transcription provider are the expensive
steps. Each job runs through: extract audio → transcribe → finalize,
updating job status in Postgres at every stage so the API's `/status`
endpoint reflects real progress.

## 6. Database setup

Schema is created automatically on boot via `initSchema()` (see
`src/services/jobStore.js`) — no separate migration step required for
this minimal schema. For a larger deployment, replace this with a proper
migration tool (e.g. `node-pg-migrate`) before adding more tables.

## 7. API documentation

| Method | Path | Description |
|---|---|---|
| `POST` | `/api/transcripts` | Body: `{ "url": "..." }`. Validates + queues a job. Returns `{ jobId, status }`. 429 if daily IP limit is hit. |
| `GET` | `/api/transcripts/:jobId/status` | Lightweight poll target. Returns `{ status, stage, error? }`. |
| `GET` | `/api/transcripts/:jobId` | Full result once completed: `{ language, segments, sourceUrl, platform }`. |
| `POST` | `/api/transcripts/:jobId/translate` | Body: `{ "targetLanguage": "Bengali" }`. Returns translated segments; original is untouched server-side. |
| `POST` | `/api/transcripts/:jobId/summary` | Returns `{ summary, keyPoints }`. |
| `GET` | `/api/transcripts/:jobId/txt` | Plain-text download. |
| `GET` | `/api/transcripts/:jobId/srt` | SRT subtitle download. |
| `GET` | `/api/transcripts/:jobId/pdf` | Branded PDF download (streamed). |

Job `status` values: `queued`, `processing`, `completed`, `failed`, `expired`.

## 8. Security notes

- **SSRF**: `services/platformDetect.js` allow-lists exact hostnames and
  `assertSafeToFetch` resolves DNS and rejects private/loopback/link-local
  IPs (including the `169.254.169.254` cloud metadata range) right before
  every extraction — not just at submit time — to close DNS-rebinding gaps.
- **Command injection**: `yt-dlp` is invoked via `execFile` with an
  argument array (`services/mediaExtraction.js`), never a shell string, so
  the submitted URL can't break out into arbitrary shell commands.
- **Secrets**: all provider API keys live only in this backend's
  environment; the frontend never sees them.
- **Rate limiting**: a coarse per-IP request limit (`express-rate-limit`)
  sits in front of everything, plus a dedicated daily-transcript counter
  in Redis (`services/rateLimit.js`) that's the actual source of truth for
  the free-tier limit — the frontend's disabled button is a convenience
  only.
- **Data minimization**: IPs are hashed before being used as a rate-limit
  key rather than stored raw; temp audio files are deleted immediately
  after each job (`media.cleanup()` in the worker's `finally` block).
- **Error surface**: the central error handler in `server.js` and each
  route only ever return the friendly, pre-written messages from the spec
  — never stack traces, provider responses, or file paths.

## 9. Rate-limit configuration

Set `FREE_DAILY_LIMIT` (default 5). Counters are per-hashed-IP, stored in
Redis with a ~26 hour TTL, and reset naturally by date. To go stricter
under abuse, lower this value or add a second, shorter-window limiter in
`server.js` alongside the existing one.

## 10. Troubleshooting

- **Jobs stuck in `queued`**: worker process isn't running, or can't
  reach Redis — check `REDIS_URL` and that `npm run worker` is alive.
- **`extracting_audio` always fails**: confirm `yt-dlp` and `ffmpeg` are
  installed on the worker host and on `PATH`; run `yt-dlp --version`
  directly on that host to isolate the issue from application code.
- **Transcription requests time out**: check the configured
  `TRANSCRIPTION_API_URL` is reachable from the worker host and that the
  provider supports the `verbose_json` response format with word-level
  timestamps; adjust `timeoutMs` in `services/transcription.js` for very
  long videos.
- **429s from `/api/transcripts`**: expected once an IP hits
  `FREE_DAILY_LIMIT` for the day — this is by design, not a bug.

## What's NOT included

This scaffold implements the architecture end-to-end but deliberately
leaves a few things for you to wire up with real credentials/infra before
it's truly production-live:
- An actual Whisper-compatible provider account (OpenAI, Groq, Deepgram,
  a self-hosted `faster-whisper` server, etc.) behind `TRANSCRIPTION_API_URL`.
- A translation provider (DeepL, Google Cloud Translate, etc.) behind
  `TRANSLATION_API_URL`.
- An LLM provider for summaries behind `SUMMARY_API_URL`.
- Object storage wiring if you want audio to leave the worker's local
  disk (the current implementation processes audio in a temp directory
  and deletes it immediately, which is sufficient for most deployments).
- An ad network snippet inserted into the frontend's ad slot components.
