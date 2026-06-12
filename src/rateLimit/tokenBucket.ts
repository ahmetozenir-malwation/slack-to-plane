type BucketState = { tokens: number; lastRefill: number };

export type LimiterConfig = {
  capacity: number;
  refillPerSec: number;
};

export class TokenBucketLimiter {
  private readonly buckets = new Map<string, BucketState>();

  constructor(private readonly cfg: LimiterConfig) {}

  tryAcquire(key: string): boolean {
    const now = Date.now();
    let b = this.buckets.get(key);
    if (!b) {
      b = { tokens: this.cfg.capacity, lastRefill: now };
      this.buckets.set(key, b);
    } else {
      const elapsedSec = (now - b.lastRefill) / 1000;
      const refill = elapsedSec * this.cfg.refillPerSec;
      b.tokens = Math.min(this.cfg.capacity, b.tokens + refill);
      b.lastRefill = now;
    }
    if (b.tokens >= 1) {
      b.tokens -= 1;
      return true;
    }
    return false;
  }
}
