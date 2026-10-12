// アカウントごとのアクセストークン取得・更新。失効時はアカウントを reauth_required にして再接続を促す。
import { MailError } from "../errors";
import type { TokenCipher } from "./crypto";
import { refreshAccessToken, type GoogleOAuthConfig } from "./google-oauth";
import type { Logger } from "./logger";
import type { AccountRecord, AccountRepository, Clock } from "./ports";

export interface AccessTokenSource {
  getAccessToken(opts?: { forceRefresh?: boolean }): Promise<string>;
}

export const tokenAad = {
  refresh: (accountId: string) => `refresh:${accountId}`,
  access: (accountId: string) => `access:${accountId}`,
};

export interface TokenManagerDeps {
  accounts: AccountRepository;
  cipher: TokenCipher;
  oauth: GoogleOAuthConfig;
  clock: Clock;
  logger: Logger;
  fetchImpl?: typeof fetch;
}

export class GoogleTokenManager {
  /** 同一プロセス内の同時更新を1回にまとめる */
  private readonly inflight = new Map<string, Promise<string>>();

  constructor(private readonly deps: TokenManagerDeps) {}

  forAccount(account: AccountRecord): AccessTokenSource {
    return { getAccessToken: (opts) => this.getAccessToken(account.id, opts?.forceRefresh ?? false) };
  }

  async getAccessToken(accountId: string, forceRefresh: boolean): Promise<string> {
    const account = await this.deps.accounts.findById(accountId);
    if (!account) throw new MailError("NOT_CONNECTED");
    if (account.status !== "active") throw new MailError("REAUTH_REQUIRED", undefined, { detail: account.statusReason ?? undefined });

    const now = this.deps.clock.now();
    if (!forceRefresh && account.accessTokenEnc && account.accessTokenExpiresAt && account.accessTokenExpiresAt > now) {
      try {
        return this.deps.cipher.decrypt(account.accessTokenEnc, tokenAad.access(account.id));
      } catch {
        // 鍵ローテーション等で復号できなければ更新する
      }
    }
    const existing = this.inflight.get(accountId);
    if (existing) return existing;
    const p = this.refresh(account).finally(() => this.inflight.delete(accountId));
    this.inflight.set(accountId, p);
    return p;
  }

  private async refresh(account: AccountRecord): Promise<string> {
    const { cipher, accounts, logger } = this.deps;
    let refreshToken: string;
    try {
      refreshToken = cipher.decrypt(account.refreshTokenEnc, tokenAad.refresh(account.id));
    } catch {
      await accounts.markReauthRequired(account.id, "token_decrypt_failed");
      logger.error("oauth.refresh_token_decrypt_failed", { accountId: account.id });
      throw new MailError("REAUTH_REQUIRED", undefined, { detail: "token_decrypt_failed" });
    }
    try {
      const tokens = await refreshAccessToken(this.deps.oauth, refreshToken, this.deps.fetchImpl, this.deps.clock.now());
      await accounts.updateAccessToken(account.id, cipher.encrypt(tokens.accessToken, tokenAad.access(account.id)), tokens.expiresAt);
      if (tokens.refreshToken && tokens.refreshToken !== refreshToken) {
        await accounts.updateRefreshToken(account.id, cipher.encrypt(tokens.refreshToken, tokenAad.refresh(account.id)));
      }
      return tokens.accessToken;
    } catch (e) {
      if (e instanceof MailError && e.code === "REAUTH_REQUIRED") {
        await accounts.markReauthRequired(account.id, e.detail ?? "refresh_failed");
        logger.warn("oauth.reauth_required", { accountId: account.id, errorCode: e.detail });
      }
      throw e;
    }
  }
}
