import { randomBytes, timingSafeEqual } from "node:crypto";

/**
 * Generates a cryptographically random 32-byte hex token.
 */
export function generateToken(): string {
  return randomBytes(32).toString("hex");
}

/**
 * Validates a provided token against the expected token using
 * constant-time comparison to prevent timing attacks.
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
 */
export class RateLimiter {
  private attempts = new Map<string, { count: number; blockedUntil: number }>();
  private readonly maxAttempts: number;
  private readonly blockDurationMs: number;

  constructor(maxAttempts = 5, blockDurationMs = 60_000) {
    this.maxAttempts = maxAttempts;
    this.blockDurationMs = blockDurationMs;
  }

  /**
   * Check if an IP is currently blocked.
   */
  isBlocked(ip: string): boolean {
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
    const entry = this.attempts.get(ip) || { count: 0, blockedUntil: 0 };
    entry.count++;

    if (entry.count >= this.maxAttempts) {
      entry.blockedUntil = Date.now() + this.blockDurationMs;
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
}
