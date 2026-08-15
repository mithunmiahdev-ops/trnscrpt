import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { config } from './config.js';
import { transcriptsRouter } from './routes/transcripts.js';
import { initSchema } from './services/jobStore.js';

const app = express();

app.use(helmet());
app.use(cors({ origin: config.publicAppUrl }));
app.use(express.json({ limit: '256kb' }));

// Coarse request-level rate limit, in addition to the per-IP daily job
// counter enforced inside the transcripts route. This one guards against
// bursts/automated abuse across all endpoints.
app.use(
  rateLimit({
    windowMs: 60 * 1000,
    limit: 60,
    standardHeaders: true,
    legacyHeaders: false,
  })
);

app.get('/healthz', (req, res) => res.json({ ok: true }));

app.use('/api/transcripts', transcriptsRouter());

// Central error handler — never leak stack traces, provider errors, or
// internal paths to the client.
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({
    error: 'Something went wrong. Please try again.',
  });
});

async function start() {
  await initSchema();
  app.listen(config.port, () => {
    console.log(`Trnscrpt API listening on port ${config.port}`);
  });
}

start();
