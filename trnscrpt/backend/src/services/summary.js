import fetch from 'node-fetch';
import { config } from '../config.js';

export class SummaryError extends Error {}

/**
 * Generates a short summary + key points from transcript text using an
 * LLM provider. Only available once a job's transcription has completed.
 */
export async function generateSummary(fullText) {
  if (!config.summary.apiUrl || !config.summary.apiKey) {
    throw new SummaryError('Summary provider is not configured.');
  }

  const prompt = `Summarize the following video transcript in 2-3 sentences, ` +
    `then list up to 4 key points as short bullet phrases. ` +
    `Respond ONLY as JSON: {"summary": "...", "keyPoints": ["...", "..."]}.\n\n` +
    `Transcript:\n${fullText.slice(0, 12000)}`;

  const res = await fetch(config.summary.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': config.summary.apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: 'claude-sonnet-4-6',
      max_tokens: 500,
      messages: [{ role: 'user', content: prompt }],
    }),
  });

  if (!res.ok) {
    throw new SummaryError('Could not generate a summary right now.');
  }

  const data = await res.json();
  const raw = (data.content || []).find((b) => b.type === 'text')?.text || '{}';

  try {
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    return {
      summary: parsed.summary || '',
      keyPoints: Array.isArray(parsed.keyPoints) ? parsed.keyPoints.slice(0, 4) : [],
    };
  } catch {
    throw new SummaryError('Could not generate a summary right now.');
  }
}
