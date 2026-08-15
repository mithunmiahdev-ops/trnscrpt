import { config } from '../config.js';

export class DailyLimitExceededError extends Error {}

/**
 * Server-side, IP-scoped daily counter stored in Redis with an automatic
 * expiry (24h TTL). This is the source of truth — the frontend may also
 * disable the button optimistically, but that's a convenience, not the
 * enforcement mechanism.
 *
 * We store only a hashed IP + a count, never raw request logs tied to
 * personal data beyond what's needed for abuse prevention.
 */
export function makeRateLimiter(redis) {
  return async function checkAndIncrement(ip) {
    const key = `usage:${hashIp(ip)}:${todayKey()}`;
    const count = await redis.incr(key);
    if (count === 1) {
      await redis.expire(key, 60 * 60 * 26); // slightly over 24h to cover clock drift
    }
    if (count > config.limits.freeDailyLimit) {
      throw new DailyLimitExceededError(
        "You've reached today's free transcript limit. Please try again tomorrow."
      );
    }
    return { count, limit: config.limits.freeDailyLimit };
  };
}

function todayKey() {
  return new Date().toISOString().slice(0, 10); // YYYY-MM-DD (UTC)
}

// Lightweight non-cryptographic hash is sufficient here since this only
// needs to avoid storing raw IPs at rest, not resist targeted attack.
function hashIp(ip) {
  let hash = 0;
  const str = String(ip);
  for (let i = 0; i < str.length; i++) {
    hash = (hash * 31 + str.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}
