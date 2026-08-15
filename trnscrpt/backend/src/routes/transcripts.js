import { Router } from 'express';
import { nanoid } from 'nanoid';
import { detectPlatform, UnsupportedUrlError } from '../services/platformDetect.js';
import { createJob, getJob, updateJob } from '../services/jobStore.js';
import { enqueueTranscriptJob } from '../queue/queue.js';
import { translateSegments, TranslationError } from '../services/translation.js';
import { generateSummary, SummaryError } from '../services/summary.js';
import { toTxt, toSrt, toPdfStream } from '../services/export.js';
import { makeRateLimiter, DailyLimitExceededError } from '../services/rateLimit.js';
import { connection } from '../queue/queue.js';

export function transcriptsRouter() {
  const router = Router();
  const checkDailyLimit = makeRateLimiter(connection);

  // Map job stage -> the four user-facing labels the frontend polls for.
  const STAGE_LABELS = {
    detecting_language: 'Detecting language...',
    extracting_audio: 'Extracting audio...',
    transcribing: 'Transcribing...',
    finalizing: 'Finalizing...',
    done: 'Done',
  };

  // POST /api/transcripts — create a job
  router.post('/', async (req, res) => {
    try {
      await checkDailyLimit(req.ip);
    } catch (err) {
      if (err instanceof DailyLimitExceededError) {
        return res.status(429).json({ error: err.message });
      }
      throw err;
    }

    const { url } = req.body || {};
    let platform, normalizedUrl;
    try {
      ({ platform, url: normalizedUrl } = detectPlatform(url));
    } catch (err) {
      if (err instanceof UnsupportedUrlError) {
        return res.status(400).json({ error: err.message });
      }
      throw err;
    }

    const jobId = nanoid(12);
    await createJob({ id: jobId, sourceUrl: normalizedUrl, platform });
    await enqueueTranscriptJob({ jobId, sourceUrl: normalizedUrl, platform });

    res.status(202).json({ jobId, status: 'queued' });
  });

  // GET /api/transcripts/:jobId/status — lightweight polling endpoint
  router.get('/:jobId/status', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });

    res.json({
      jobId: job.id,
      status: job.status,
      stage: STAGE_LABELS[job.stage] || job.stage,
      error: job.status === 'failed' ? job.error_message : undefined,
    });
  });

  // GET /api/transcripts/:jobId — full result
  router.get('/:jobId', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job) return res.status(404).json({ error: 'Job not found.' });
    if (job.status === 'expired') {
      return res.status(410).json({ error: 'This transcript has expired.' });
    }
    if (job.status !== 'completed') {
      return res.status(409).json({ error: 'Transcript is not ready yet.', status: job.status });
    }

    res.json({
      jobId: job.id,
      platform: job.platform,
      sourceUrl: job.source_url,
      language: job.language,
      status: job.status,
      segments: job.segments,
    });
  });

  // POST /api/transcripts/:jobId/translate
  router.post('/:jobId/translate', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || job.status !== 'completed') {
      return res.status(409).json({ error: 'Transcript is not ready yet.' });
    }
    const { targetLanguage } = req.body || {};
    try {
      const translated = await translateSegments(job.segments, targetLanguage);
      res.json({ jobId: job.id, language: targetLanguage, segments: translated });
    } catch (err) {
      if (err instanceof TranslationError) {
        return res.status(422).json({ error: err.message });
      }
      throw err;
    }
  });

  // POST /api/transcripts/:jobId/summary
  router.post('/:jobId/summary', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || job.status !== 'completed') {
      return res.status(409).json({ error: 'Transcript is not ready yet.' });
    }
    try {
      const fullText = job.segments.map((s) => s.text).join(' ');
      const summary = await generateSummary(fullText);
      res.json({ jobId: job.id, ...summary });
    } catch (err) {
      if (err instanceof SummaryError) {
        return res.status(422).json({ error: err.message });
      }
      throw err;
    }
  });

  // GET /api/transcripts/:jobId/txt
  router.get('/:jobId/txt', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || job.status !== 'completed') return res.status(409).end();
    res.set('Content-Type', 'text/plain').send(toTxt(job.segments));
  });

  // GET /api/transcripts/:jobId/srt
  router.get('/:jobId/srt', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || job.status !== 'completed') return res.status(409).end();
    res.set('Content-Type', 'application/x-subrip').send(toSrt(job.segments));
  });

  // GET /api/transcripts/:jobId/pdf
  router.get('/:jobId/pdf', async (req, res) => {
    const job = await getJob(req.params.jobId);
    if (!job || job.status !== 'completed') return res.status(409).end();
    res.set('Content-Type', 'application/pdf');
    const doc = toPdfStream({ sourceUrl: job.source_url, language: job.language, segments: job.segments });
    doc.pipe(res);
  });

  return router;
}
