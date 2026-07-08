import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generates a cryptographically random 32-byte hex token.
 * Used as the authentication secret for WebSocket connections.
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Validates a provided token against the expected token using
 * constant-time comparison to prevent timing attacks.
 *
 * Returns false if either token is missing or they differ in length,
 * without leaking timing information about the expected value.
 */
export function validateToken(provided: string, expected: string): boolean {
  if (!provided || !expected) {
    return false;
  }

  const providedBuf = Buffer.from(provided, "utf-8");
  const expectedBuf = Buffer.from(expected, "utf-8");

  if (providedBuf.length !== expectedBuf.length) {
    return false;
  }

  return timingSafeEqual(providedBuf, expectedBuf);
}

/**
 * Rate limiter for authentication attempts.
 * Tracks failed attempts per IP and blocks after threshold.
 *
 * Used by both the CLI's single-session server and the hub's dashboard
 * server so a single WebSocket/HTTP auth endpoint can't be brute-forced.
 *
 * Entries are pruned lazily — piggy-backed on normal `isBlocked`/`recordFailure`
 * calls and throttled to at most once per `blockDurationMs` — so IPs that fail
 * a few times below the block threshold and never come back don't accumulate
 * forever in memory on a long-lived daemon.
 */
export class RateLimiter {
  private attempts = new Map<string, { count: number; blockedUntil: number; lastAttemptAt: number }>();
  private readonly maxAttempts: number;
  private readonly blockDurationMs: number;
  private lastPruneAt = Date.now();

  constructor(maxAttempts = 5, blockDurationMs = 60_000) {
    this.maxAttempts = maxAttempts;
    this.blockDurationMs = blockDurationMs;
  }

  /**
   * Sweep out entries that are no longer blocked and haven't had a failed
   * attempt in over `blockDurationMs`. Throttled to once per `blockDurationMs`
   * so it never turns a single call into an O(n) scan under load.
   */
  private pruneStaleEntries(): void {
    const now = Date.now();
    if (now - this.lastPruneAt < this.blockDurationMs) return;
    this.lastPruneAt = now;

    for (const [ip, entry] of this.attempts) {
      const isCurrentlyBlocked = entry.blockedUntil > now;
      const isStale = now - entry.lastAttemptAt > this.blockDurationMs;
      if (!isCurrentlyBlocked && isStale) {
        this.attempts.delete(ip);
      }
    }
  }

  /**
   * Check if an IP is currently blocked.
   */
  isBlocked(ip: string): boolean {
    this.pruneStaleEntries();
    const entry = this.attempts.get(ip);
    if (!entry) return false;

    if (entry.blockedUntil > Date.now()) {
      return true;
    }

    // Block expired — reset
    if (entry.count >= this.maxAttempts) {
      this.attempts.delete(ip);
    }
    return false;
  }

  /**
   * Record a failed authentication attempt.
   * Returns true if the IP is now blocked.
   */
  recordFailure(ip: string): boolean {
    this.pruneStaleEntries();
    const now = Date.now();
    const entry = this.attempts.get(ip) || { count: 0, blockedUntil: 0, lastAttemptAt: now };
    entry.count++;
    entry.lastAttemptAt = now;

    if (entry.count >= this.maxAttempts) {
      entry.blockedUntil = now + this.blockDurationMs;
      this.attempts.set(ip, entry);
      return true;
    }

    this.attempts.set(ip, entry);
    return false;
  }

  /**
   * Clear tracking for an IP (on successful auth).
   */
  clearIP(ip: string): void {
    this.attempts.delete(ip);
  }

  /**
   * Number of IPs currently tracked. Exposed for tests/diagnostics.
   */
  get size(): number {
    return this.attempts.size;
  }
}
