import dns from 'node:dns/promises';
import net from 'node:net';

// Domains we accept. Matched against the URL's hostname only (never path/query),
// so query-string tricks like ?redirect=youtube.com cannot spoof platform detection.
const PLATFORM_DOMAINS = {
  youtube: ['youtube.com', 'www.youtube.com', 'm.youtube.com', 'youtu.be'],
  facebook: ['facebook.com', 'www.facebook.com', 'm.facebook.com', 'fb.watch'],
  instagram: ['instagram.com', 'www.instagram.com'],
  tiktok: ['tiktok.com', 'www.tiktok.com', 'm.tiktok.com'],
  pinterest: ['pinterest.com', 'www.pinterest.com', 'pin.it'],
};

export class UnsupportedUrlError extends Error {}
export class UnsafeUrlError extends Error {}

/**
 * Validate + normalize a submitted URL, returning { platform, url }.
 * Throws UnsupportedUrlError for anything not on the allow-list.
 */
export function detectPlatform(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl).trim());
  } catch {
    throw new UnsupportedUrlError('Please enter a valid supported video URL.');
  }

  if (!['http:', 'https:'].includes(parsed.protocol)) {
    throw new UnsupportedUrlError('Please enter a valid supported video URL.');
  }

  const host = parsed.hostname.toLowerCase();

  for (const [platform, domains] of Object.entries(PLATFORM_DOMAINS)) {
    if (domains.includes(host)) {
      return { platform, url: parsed.toString() };
    }
  }

  throw new UnsupportedUrlError(
    "Please enter a valid YouTube, Facebook, Instagram, TikTok, or Pinterest video URL."
  );
}

/**
 * SSRF guard: resolve the hostname and reject anything that points at
 * private, loopback, link-local, or metadata-service IP ranges. Call this
 * right before any outbound fetch/extraction, not just at submit time,
 * since DNS can change between validation and use ("time of check to time
 * of use").
 */
export async function assertSafeToFetch(rawUrl) {
  const parsed = new URL(rawUrl);
  const addresses = await dns.lookup(parsed.hostname, { all: true });

  for (const { address } of addresses) {
    if (isDisallowedIp(address)) {
      throw new UnsafeUrlError('This URL cannot be processed.');
    }
  }
  return true;
}

function isDisallowedIp(ip) {
  if (net.isIPv4(ip)) {
    const octets = ip.split('.').map(Number);
    const [a, b] = octets;
    if (a === 127) return true; // loopback
    if (a === 10) return true; // private
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 169 && b === 254) return true; // link-local / cloud metadata
    if (a === 0) return true;
    return false;
  }
  if (net.isIPv6(ip)) {
    const lower = ip.toLowerCase();
    if (lower === '::1') return true; // loopback
    if (lower.startsWith('fe80:')) return true; // link-local
    if (lower.startsWith('fc') || lower.startsWith('fd')) return true; // unique local
    return false;
  }
  return true; // unknown format — fail closed
}
