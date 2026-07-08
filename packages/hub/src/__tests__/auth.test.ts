import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { generateToken, validateToken, RateLimiter } from "@itwillsync/shared/auth";

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

  describe("stale entry pruning (memory growth guard)", () => {
    beforeEach(() => {
      vi.useFakeTimers();
    });

    afterEach(() => {
      vi.useRealTimers();
    });

    it("prunes an IP that failed once (below the block threshold) and never returned", () => {
      limiter.recordFailure("1.2.3.4"); // 1 of 3 — never actually blocked
      expect(limiter.size).toBe(1);

      // Long past blockDurationMs (1s) with no further activity from this IP.
      vi.advanceTimersByTime(5000);

      // Pruning piggy-backs on any call; use an unrelated IP to trigger the sweep.
      limiter.isBlocked("9.9.9.9");

      expect(limiter.size).toBe(0);
    });

    it("never prunes an IP that is still inside its active block window", () => {
      // Force an initial sweep so the internal throttle clock (lastPruneAt) is
      // anchored well before the block below, so a later sweep is actually due
      // (not just throttled) while the entry is still legitimately blocked.
      vi.advanceTimersByTime(1200);
      limiter.isBlocked("force-sweep-1");

      vi.advanceTimersByTime(400);
      limiter.recordFailure("1.2.3.4");
      limiter.recordFailure("1.2.3.4");
      limiter.recordFailure("1.2.3.4"); // 3rd failure -> blocked for 1000ms from now
      expect(limiter.isBlocked("1.2.3.4")).toBe(true);

      // Advance past the throttle window (so a sweep is due again) while
      // comfortably still inside the block window (350ms of margin).
      vi.advanceTimersByTime(650);
      limiter.isBlocked("force-sweep-2");

      expect(limiter.size).toBe(1);
      expect(limiter.isBlocked("1.2.3.4")).toBe(true);
    });
  });
});
