import { describe, expect, it, vi } from "vitest";
import { TokenBucketLimiter } from "../../src/rateLimit/tokenBucket.js";

describe("TokenBucketLimiter", () => {
  it("allows up to capacity requests immediately", () => {
    const lim = new TokenBucketLimiter({ capacity: 3, refillPerSec: 1 });
    expect(lim.tryAcquire("k")).toBe(true);
    expect(lim.tryAcquire("k")).toBe(true);
    expect(lim.tryAcquire("k")).toBe(true);
    expect(lim.tryAcquire("k")).toBe(false);
  });

  it("refills tokens over time", () => {
    vi.useFakeTimers();
    const lim = new TokenBucketLimiter({ capacity: 2, refillPerSec: 1 });
    lim.tryAcquire("k");
    lim.tryAcquire("k");
    expect(lim.tryAcquire("k")).toBe(false);
    vi.advanceTimersByTime(1500);
    expect(lim.tryAcquire("k")).toBe(true);
    vi.useRealTimers();
  });

  it("keys are isolated", () => {
    const lim = new TokenBucketLimiter({ capacity: 1, refillPerSec: 0 });
    expect(lim.tryAcquire("a")).toBe(true);
    expect(lim.tryAcquire("b")).toBe(true);
    expect(lim.tryAcquire("a")).toBe(false);
  });
});
