import fetch from 'node-fetch';
import { config } from '../config.js';

export class TranslationError extends Error {}

const SUPPORTED_LANGUAGES = [
  'English', 'Spanish', 'French', 'German', 'Portuguese', 'Italian',
  'Arabic', 'Hindi', 'Bengali', 'Urdu', 'Japanese', 'Korean', 'Chinese',
];

/**
 * Translates transcript segments while preserving start/end timestamps.
 * This always runs server-side — translation credentials never reach the
 * client — and the original-language segments are never mutated, only
 * returned as a separate array, so the original stays available.
 */
export async function translateSegments(segments, targetLanguage) {
  if (!SUPPORTED_LANGUAGES.includes(targetLanguage)) {
    throw new TranslationError('Unsupported target language.');
  }
  if (!config.translation.apiUrl || !config.translation.apiKey) {
    throw new TranslationError('Translation provider is not configured.');
  }

  const res = await fetch(config.translation.apiUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${config.translation.apiKey}`,
    },
    body: JSON.stringify({
      target_language: targetLanguage,
      texts: segments.map((s) => s.text),
    }),
  });

  if (!res.ok) {
    throw new TranslationError('Translation failed. Please try again.');
  }

  const data = await res.json();
  const translatedTexts = data.translations || [];

  return segments.map((seg, i) => ({
    start: seg.start,
    end: seg.end,
    text: translatedTexts[i] ?? seg.text,
  }));
}

export { SUPPORTED_LANGUAGES };
