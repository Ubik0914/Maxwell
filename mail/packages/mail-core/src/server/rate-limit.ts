// プロセス内のトークンバケット型レート制限。
// サーバーレスではインスタンスごとの制限になる（READMEに記載）。本人専用アプリの誤操作・暴走防止が目的。
export class RateLimiter {
  private readonly buckets = new Map<string, { tokens: number; updatedAt: number }>();

  constructor(
    private readonly capacity: number,
    private readonly refillPerSecond: number,
    private readonly now: () => number = Date.now,
  ) {}

  /** 消費できれば true。できなければ待機すべき ms を返す */
  take(key: string, cost = 1): { ok: true } | { ok: false; retryAfterMs: number } {
    const t = this.now();
    const b = this.buckets.get(key) ?? { tokens: this.capacity, updatedAt: t };
    b.tokens = Math.min(this.capacity, b.tokens + ((t - b.updatedAt) / 1000) * this.refillPerSecond);
    b.updatedAt = t;
    if (b.tokens >= cost) {
      b.tokens -= cost;
      this.buckets.set(key, b);
      return { ok: true };
    }
    this.buckets.set(key, b);
    if (this.buckets.size > 10_000) this.buckets.clear();
    return { ok: false, retryAfterMs: Math.ceil(((cost - b.tokens) / this.refillPerSecond) * 1000) };
  }
}
