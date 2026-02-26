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
