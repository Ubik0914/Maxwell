import "server-only";
import { randomUUID } from "node:crypto";
import { MailError, webPath } from "@synedge/mail-core";
import {
  buildAuthUrl,
  createPkcePair,
  exchangeCode,
  hasGmailScope,
  randomToken,
  readIdToken,
  revokeToken,
  safeEqual,
  sha256Hex,
  tokenAad,
} from "@synedge/mail-core/server";
import { jwtVerify, SignJWT } from "jose";
import type { Container } from "./container";
import { isSecureOrigin } from "./env";

export const OAUTH_COOKIE = "syn_oauth";
const OAUTH_TTL_SECONDS = 600;
const HANDOFF_TTL_MS = 2 * 60_000;

export type Platform = "web" | "android";

interface OAuthState {
  state: string;
  verifier: string;
  platform: Platform;
  next: string;
}

/** オープンリダイレクトを防ぐ：自サイト内の相対パスのみ。next は basePath 込みのブラウザ上のパス */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) return "/mail";
  return next.slice(0, 512);
}

const secretKey = (c: Container) => new TextEncoder().encode(c.env.SESSION_SECRET);

export async function startOAuth(c: Container, platform: Platform, next: string) {
  const state = randomToken(24);
  const { verifier, challenge } = createPkcePair();
  const cookie = await new SignJWT({ state, verifier, platform, next: safeNext(next) } satisfies OAuthState)
    .setProtectedHeader({ alg: "HS256" })
    .setAudience("synedge-oauth")
    .setExpirationTime(`${OAUTH_TTL_SECONDS}s`)
    .sign(secretKey(c));
  return {
    url: buildAuthUrl(c.oauth, { state, codeChallenge: challenge }),
    cookie: {
      name: OAUTH_COOKIE,
      value: cookie,
      options: {
        httpOnly: true,
        secure: isSecureOrigin(c.env),
        sameSite: "lax" as const,
        path: webPath("/api/auth/google"),
        maxAge: OAUTH_TTL_SECONDS,
      },
    },
  };
}

export async function readOAuthCookie(c: Container, value: string | undefined): Promise<OAuthState | null> {
  if (!value) return null;
  try {
    const { payload } = await jwtVerify(value, secretKey(c), { audience: "synedge-oauth", algorithms: ["HS256"] });
    return payload as unknown as OAuthState;
  } catch {
    return null;
  }
}

export interface CallbackResult {
  userId: string;
  sessionVersion: number;
  platform: Platform;
  next: string;
}

/**
 * OAuth コールバック処理：state 検証（CSRF対策）→ コード交換 → 本人確認 → トークン暗号化保存 → 同期初期化
 */
export async function completeOAuth(
  c: Container,
  params: { code: string | null; state: string | null; error: string | null },
  cookieValue: string | undefined,
): Promise<CallbackResult> {
  const saved = await readOAuthCookie(c, cookieValue);
  if (!saved || !params.state || !safeEqual(saved.state, params.state)) {
    throw new MailError("FORBIDDEN", "ログイン要求の検証に失敗しました。もう一度やり直してください。");
  }
  if (params.error || !params.code) {
    throw new MailError("UNAUTHENTICATED", "Googleでの認可がキャンセルされました。");
  }
  const tokens = await exchangeCode(c.oauth, { code: params.code, codeVerifier: saved.verifier }, c.fetchImpl, c.now());
  if (!tokens.idToken) throw new MailError("UNAUTHENTICATED", "本人確認情報を取得できませんでした。");
  const identity = readIdToken(tokens.idToken, c.oauth.clientId, c.now());

  if (!identity.emailVerified || !c.env.ALLOWED_EMAILS.includes(identity.email)) {
    // 許可されていないアカウントのトークンは保存せず、すぐに取り消す
    await revokeToken(tokens.refreshToken ?? tokens.accessToken, c.fetchImpl);
    c.logger.warn("auth.rejected_account");
    throw new MailError("FORBIDDEN", "このGoogleアカウントは利用を許可されていません。");
  }
  if (!hasGmailScope(tokens.scopes)) {
    await revokeToken(tokens.refreshToken ?? tokens.accessToken, c.fetchImpl);
    throw new MailError("INSUFFICIENT_SCOPE", "Gmailへのアクセスが許可されませんでした。同意画面ですべての項目を許可してください。");
  }

  const user = await c.repos.users.upsertByEmail(identity.email);
  const existing = await c.repos.accounts.findByProviderEmail("gmail", identity.email);
  if (existing && existing.userId !== user.id) throw new MailError("FORBIDDEN");
  const accountId = existing?.id ?? randomUUID();

  let refreshEnc: string;
  if (tokens.refreshToken) {
    refreshEnc = c.core.cipher.encrypt(tokens.refreshToken, tokenAad.refresh(accountId));
  } else if (existing) {
    // prompt=consent でも refresh token が返らない場合は既存のものを使い続ける
    refreshEnc = existing.refreshTokenEnc;
  } else {
    throw new MailError("UNAUTHENTICATED", "Googleから更新用トークンを取得できませんでした。もう一度ログインしてください。");
  }

  const account = await c.repos.accounts.upsertConnection({
    id: accountId,
    userId: user.id,
    provider: "gmail",
    email: identity.email,
    refreshTokenEnc: refreshEnc,
    accessTokenEnc: c.core.cipher.encrypt(tokens.accessToken, tokenAad.access(accountId)),
    accessTokenExpiresAt: tokens.expiresAt,
    scopes: tokens.scopes,
  });

  try {
    await c.core.sync.initializeAccount(account.id);
  } catch (e) {
    // 同期・watch の初期化失敗はログインを妨げない（定期ジョブで再試行される）
    c.logger.warn("auth.initialize_failed", { accountId: account.id, error: e });
  }
  c.logger.info("auth.connected", { userId: user.id, accountId: account.id, reconnect: !!existing });
  return { userId: user.id, sessionVersion: user.sessionVersion, platform: saved.platform, next: saved.next };
}

/** Androidアプリへログインを受け渡すワンタイムコード */
export async function createHandoffCode(c: Container, userId: string): Promise<string> {
  const code = randomToken(32);
  await c.repos.handoff.create(sha256Hex(code), userId, new Date(c.now().getTime() + HANDOFF_TTL_MS));
  return code;
}

export async function consumeHandoffCode(c: Container, code: string): Promise<string | null> {
  if (!/^[A-Za-z0-9_-]{20,100}$/.test(code)) return null;
  return c.repos.handoff.consume(sha256Hex(code), c.now());
}

/** 接続解除：watch停止・トークン取り消し・保存データ削除（Gmail のメール自体は削除しない） */
export async function disconnectAccount(c: Container, userId: string): Promise<{ revoked: boolean }> {
  const accounts = await c.repos.accounts.listByUser(userId);
  let revoked = true;
  for (const account of accounts) {
    if (account.status === "active") {
      try {
        await c.core.providerFactory(account).stopWatch();
      } catch (e) {
        c.logger.warn("disconnect.stop_watch_failed", { accountId: account.id, error: e });
      }
    }
    try {
      const refresh = c.core.cipher.decrypt(account.refreshTokenEnc, tokenAad.refresh(account.id));
      revoked = (await revokeToken(refresh, c.fetchImpl)) && revoked;
    } catch {
      revoked = false;
    }
    await c.repos.deliveries.deleteForAccount(account.id);
    await c.repos.accounts.delete(account.id);
  }
  await c.repos.devices.deleteAllForUser(userId);
  await c.repos.mcpTokens.revokeAllForUser(userId);
  await c.repos.users.bumpSessionVersion(userId);
  c.logger.info("auth.disconnected", { userId, revoked });
  return { revoked };
}
