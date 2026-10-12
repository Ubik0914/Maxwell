import "server-only";
import { randomUUID } from "node:crypto";
import { MailError, webPath } from "@/mail/core";
import {
  buildAuthUrl,
  createPkcePair,
  exchangeCode,
  hasGmailScope,
  randomToken,
  readIdToken,
  revokeToken,
  safeEqual,
  tokenAad,
} from "@/mail/core/server";
import { jwtVerify, SignJWT } from "jose";
import type { Container } from "./container";
import { isSecureOrigin } from "./env";

export const OAUTH_COOKIE = "syn_oauth";
const OAUTH_TTL_SECONDS = 600;
const TICKET_TTL_SECONDS = 300;

export type Platform = "web" | "android";

/**
 * Gmail の接続（OAuth）中の状態。ログインは Maxwell（Supabase）が済ませているので、
 * ここで決めるのは「どの利用者に Gmail を紐づけるか」だけ。userId は署名付き Cookie に入れて運ぶ。
 */
interface OAuthState {
  state: string;
  verifier: string;
  platform: Platform;
  next: string;
  userId: string;
}

/** オープンリダイレクトを防ぐ：自サイト内のメール画面のパスのみ */
export function safeNext(next: string | null | undefined): string {
  if (!next || !next.startsWith("/mail") || next.startsWith("//") || next.includes("\\")) return webPath("/settings");
  return next.slice(0, 512);
}

const secretKey = (c: Container) => new TextEncoder().encode(c.env.MAIL_OAUTH_SECRET);

export async function startOAuth(c: Container, userId: string, platform: Platform, next: string) {
  const state = randomToken(24);
  const { verifier, challenge } = createPkcePair();
  const cookie = await new SignJWT({ state, verifier, platform, next: safeNext(next), userId } satisfies OAuthState)
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
  platform: Platform;
  next: string;
}

/**
 * Android アプリ用の接続チケット。Google は WebView 内の OAuth を拒むため、接続は外部ブラウザで行う。
 * 外部ブラウザには Maxwell のログイン Cookie がないので、WebView（ログイン済み）で短命の署名付き
 * チケットを発行し、外部ブラウザはそれを持って start へ来る。チケットは利用者IDと戻り先だけを持つ。
 */
export async function createConnectTicket(c: Container, userId: string, next: string): Promise<string> {
  return new SignJWT({ next: safeNext(next) })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(userId)
    .setAudience("mail-connect-ticket")
    .setExpirationTime(`${TICKET_TTL_SECONDS}s`)
    .sign(secretKey(c));
}

export async function readConnectTicket(c: Container, ticket: string | null): Promise<{ userId: string; next: string } | null> {
  if (!ticket) return null;
  try {
    const { payload } = await jwtVerify(ticket, secretKey(c), { audience: "mail-connect-ticket", algorithms: ["HS256"] });
    if (typeof payload.sub !== "string") return null;
    return { userId: payload.sub, next: safeNext(typeof payload.next === "string" ? payload.next : null) };
  } catch {
    return null;
  }
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

  if (!identity.emailVerified || !c.env.MAIL_ALLOWED_EMAILS.includes(identity.email)) {
    // 許可されていないアカウントのトークンは保存せず、すぐに取り消す
    await revokeToken(tokens.refreshToken ?? tokens.accessToken, c.fetchImpl);
    c.logger.warn("auth.rejected_account");
    throw new MailError("FORBIDDEN", "このGoogleアカウントは利用を許可されていません。");
  }
  if (!hasGmailScope(tokens.scopes)) {
    await revokeToken(tokens.refreshToken ?? tokens.accessToken, c.fetchImpl);
    throw new MailError("INSUFFICIENT_SCOPE", "Gmailへのアクセスが許可されませんでした。同意画面ですべての項目を許可してください。");
  }

  const user = await c.repos.users.findById(saved.userId);
  if (!user) {
    await revokeToken(tokens.refreshToken ?? tokens.accessToken, c.fetchImpl);
    throw new MailError("UNAUTHENTICATED", "ログインし直してから、もう一度接続してください。");
  }
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
  return { userId: user.id, platform: saved.platform, next: saved.next };
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
  c.logger.info("auth.disconnected", { userId, revoked });
  return { revoked };
}
