import fs from 'node:fs';
import fetch from 'node-fetch';
import { config } from '../config.js';

export class TranscriptionError extends Error {}

/**
 * Sends an audio file to a Whisper-compatible speech-to-text API and
 * normalizes the response into Trnscrpt's internal transcript format:
 *
 * {
 *   language: "en",
 *   segments: [{ start, end, text, words: [] }]
 * }
 *
 * The provider-specific response shape is never returned to the caller —
 * only this normalized structure crosses the API boundary to the frontend.
 */
export async function transcribeAudio(filePath, { timeoutMs = 4 * 60 * 1000 } = {}) {
  if (!config.transcription.apiUrl || !config.transcription.apiKey) {
    throw new TranscriptionError('Transcription provider is not configured.');
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(filePath)]), 'audio.mp3');
  form.append('response_format', 'verbose_json');
  form.append('timestamp_granularities[]', 'segment');
  form.append('timestamp_granularities[]', 'word');

  let attempt = 0;
  const maxAttempts = 3;

  while (attempt < maxAttempts) {
    attempt += 1;
    try {
      const res = await fetch(config.transcription.apiUrl, {
        method: 'POST',
        headers: { Authorization: `Bearer ${config.transcription.apiKey}` },
        body: form,
        signal: controller.signal,
      });

      if (res.status === 429 || res.status >= 500) {
        // Retryable — brief backoff, try again.
        await new Promise((r) => setTimeout(r, 500 * attempt));
        continue;
      }

      if (!res.ok) {
        throw new TranscriptionError(
          'Something went wrong while generating your transcript. Please try again.'
        );
      }

      const data = await res.json();
      clearTimeout(timer);
      return normalize(data);
    } catch (err) {
      if (err.name === 'AbortError') {
        clearTimeout(timer);
        throw new TranscriptionError('Transcription timed out. Please try again.');
      }
      if (attempt >= maxAttempts) {
        clearTimeout(timer);
        throw new TranscriptionError(
          'Something went wrong while generating your transcript. Please try again.'
        );
      }
    }
  }

  clearTimeout(timer);
  throw new TranscriptionError(
    'Something went wrong while generating your transcript. Please try again.'
  );

  function normalize(providerResponse) {
    const segments = (providerResponse.segments || []).map((seg) => ({
      start: seg.start,
      end: seg.end,
      text: (seg.text || '').trim(),
      words: (seg.words || []).map((w) => ({
        word: w.word,
        start: w.start,
        end: w.end,
      })),
    }));

    return {
      language: providerResponse.language || 'unknown',
      segments,
    };
  }
}

