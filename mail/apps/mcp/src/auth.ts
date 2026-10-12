// MCP 接続の認証。設定画面で発行した個人アクセストークン（Bearer）を検証し、本人の userId に限定する。
// URL を秘密にすることを認証の代わりにしない。
import type { McpTokenRepository } from "@synedge/database";
import { RateLimiter, sha256Hex } from "@synedge/mail-core/server";

export interface McpAuthResult {
  userId: string;
  tokenId: string;
}

export class McpAuthenticator {
  private readonly limiter = new RateLimiter(60, 1);

  constructor(
    private readonly tokens: McpTokenRepository,
    private readonly allowedEmails: string[] | null = null,
    private readonly userEmail: ((userId: string) => Promise<string | null>) | null = null,
  ) {}

  async authenticate(header: string | null | undefined): Promise<McpAuthResult | { error: "unauthorized" | "rate_limited" }> {
    const m = /^Bearer\s+(syn_[A-Za-z0-9_-]{20,100})$/.exec(header ?? "");
    if (!m) return { error: "unauthorized" };
    const record = await this.tokens.findActiveByHash(sha256Hex(m[1]!));
    if (!record) return { error: "unauthorized" };
    if (this.allowedEmails && this.userEmail) {
      const email = await this.userEmail(record.userId);
      if (!email || !this.allowedEmails.includes(email)) return { error: "unauthorized" };
    }
    if (!this.limiter.take(record.id).ok) return { error: "rate_limited" };
    void this.tokens.touch(record.id).catch(() => {});
    return { userId: record.userId, tokenId: record.id };
  }
}
