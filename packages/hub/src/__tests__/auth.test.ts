import { describe, it, expect, beforeEach } from "vitest";
import { generateToken, validateToken, RateLimiter } from "../auth.js";

describe("generateToken", () => {
  it("should return a 64-character hex string", () => {
    const token = generateToken();
    expect(token).toHaveLength(64);
    expect(token).toMatch(/^[0-9a-f]+$/);
  });

  it("should generate unique tokens", () => {
    const tokens = new Set(Array.from({ length: 100 }, () => generateToken()));
    expect(tokens.size).toBe(100);
  });
});

describe("validateToken", () => {
  it("should return true for matching tokens", () => {
    const token = generateToken();
    expect(validateToken(token, token)).toBe(true);
  });

  it("should return false for different tokens", () => {
    const t1 = generateToken();
    const t2 = generateToken();
    expect(validateToken(t1, t2)).toBe(false);
  });

  it("should return false for empty provided token", () => {
    expect(validateToken("", generateToken())).toBe(false);
  });

  it("should return false for empty expected token", () => {
    expect(validateToken(generateToken(), "")).toBe(false);
  });

  it("should return false for different length tokens", () => {
    expect(validateToken("short", generateToken())).toBe(false);
  });
});

describe("RateLimiter", () => {
  let limiter: RateLimiter;

  beforeEach(() => {
    limiter = new RateLimiter(3, 1000); // 3 attempts, 1s block
  });

  it("should not block on first attempt", () => {
    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });

  it("should block after max failures", () => {
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");
    const blocked = limiter.recordFailure("1.2.3.4");

    expect(blocked).toBe(true);
    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
  });

  it("should not block before max failures", () => {
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");

    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });

  it("should track IPs independently", () => {
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");

    expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    expect(limiter.isBlocked("5.6.7.8")).toBe(false);
  });

  it("should clear tracking for an IP", () => {
    limiter.recordFailure("1.2.3.4");
    limiter.recordFailure("1.2.3.4");
    limiter.clearIP("1.2.3.4");

    expect(limiter.isBlocked("1.2.3.4")).toBe(false);
  });
});
