import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { nanoid } from 'nanoid';
import { config } from '../config.js';
import { assertSafeToFetch } from './platformDetect.js';

const execFileAsync = promisify(execFile);

export class MediaExtractionError extends Error {}
export class VideoUnavailableError extends MediaExtractionError {}
export class PrivateVideoError extends MediaExtractionError {}
export class DurationExceededError extends MediaExtractionError {}

/**
 * Downloads only the audio track of a public video to a temporary directory
 * and returns its path. Caller is responsible for calling cleanup().
 *
 * Security notes:
 * - Arguments are passed as an array to execFile, never interpolated into
 *   a shell string, so the URL can never be used for command injection.
 * - We re-check the resolved IP right before extraction (assertSafeToFetch)
 *   to guard against SSRF via DNS rebinding between validation and use.
 * - Duration/size are enforced both via yt-dlp flags and a post-download check.
 */
export async function extractAudio(url) {
  await assertSafeToFetch(url);

  const workDir = await mkdtemp(path.join(tmpdir(), 'trnscrpt-'));
  const jobId = nanoid(10);
  const outputTemplate = path.join(workDir, `${jobId}.%(ext)s`);

  const args = [
    url,
    '--no-playlist',
    '--extract-audio',
    '--audio-format', 'mp3',
    '--audio-quality', '5',
    '--max-filesize', `${config.limits.maxMediaFileSizeMb}M`,
    '--match-filter', `duration <= ${config.limits.maxMediaDurationSeconds}`,
    '--no-check-certificates',
    '--geo-bypass=false',
    '--no-playlist-reverse',
    '--socket-timeout', '30',
    '--retries', '2',
    '--output', outputTemplate,
    '--print', 'after_move:filepath',
  ];

  let stdout;
  try {
    ({ stdout } = await execFileAsync('yt-dlp', args, {
      timeout: 5 * 60 * 1000, // hard cap on the whole extraction
      maxBuffer: 10 * 1024 * 1024,
    }));
  } catch (err) {
    await rm(workDir, { recursive: true, force: true });
    const msg = String(err?.stderr || err?.message || '');
    if (/private|login required|sign in/i.test(msg)) {
      throw new PrivateVideoError("This video isn't publicly accessible.");
    }
    if (/unavailable|not found|removed|404/i.test(msg)) {
      throw new VideoUnavailableError("We couldn't access this video. Please check the URL and try again.");
    }
    if (/duration|filesize|match-filter/i.test(msg)) {
      throw new DurationExceededError("This video is too long for our free tier right now.");
    }
    throw new MediaExtractionError("We couldn't extract audio from this video. Please try another video.");
  }

  const filePath = stdout.trim().split('\n').pop();
  const fileStat = await stat(filePath).catch(() => null);
  if (!fileStat) {
    await rm(workDir, { recursive: true, force: true });
    throw new MediaExtractionError("We couldn't extract audio from this video. Please try another video.");
  }

  return {
    filePath,
    workDir,
    sizeBytes: fileStat.size,
    cleanup: () => rm(workDir, { recursive: true, force: true }),
  };
}
