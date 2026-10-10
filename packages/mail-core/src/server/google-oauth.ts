// Google OAuth 2.0（Authorization Code + PKCE）。トークンはサーバー側でのみ扱う。
import { createHash } from "node:crypto";
import { decodeJwt } from "jose";
import { MailError } from "../errors";
import { randomToken } from "./crypto";

export const GMAIL_SCOPE = "https://www.googleapis.com/auth/gmail.modify";
/**
 * gmail.modify：読み取り・ラベル変更（既読/未読/アーカイブ）・下書き・送信をまとめて許可する最小の単一スコープ。
 * 完全削除はできない（MVPで削除を作らない方針と一致）。openid/email はログイン本人確認用。
 */
export const OAUTH_SCOPES = ["openid", "email", GMAIL_SCOPE] as const;

const AUTH_ENDPOINT = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_ENDPOINT = "https://oauth2.googleapis.com/token";
const REVOKE_ENDPOINT = "https://oauth2.googleapis.com/revoke";

export interface GoogleOAuthConfig {
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}

export interface TokenSet {
  accessToken: string;
  expiresAt: Date;
  refreshToken: string | null;
  scopes: string[];
  idToken: string | null;
}

export function createPkcePair(): { verifier: string; challenge: string } {
  const verifier = randomToken(48);
  const challenge = createHash("sha256").update(verifier).digest("base64url");
  return { verifier, challenge };
}

export function buildAuthUrl(cfg: GoogleOAuthConfig, p: { state: string; codeChallenge: string; loginHint?: string }): string {
  const url = new URL(AUTH_ENDPOINT);
  url.searchParams.set("client_id", cfg.clientId);
  url.searchParams.set("redirect_uri", cfg.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", OAUTH_SCOPES.join(" "));
  url.searchParams.set("state", p.state);
  url.searchParams.set("code_challenge", p.codeChallenge);
  url.searchParams.set("code_challenge_method", "S256");
  // refresh token を確実に得る
  url.searchParams.set("access_type", "offline");
  url.searchParams.set("prompt", "consent");
  if (p.loginHint) url.searchParams.set("login_hint", p.loginHint);
  return url.toString();
}

type FetchLike = typeof fetch;

async function postForm(fetchImpl: FetchLike, url: string, form: Record<string, string>): Promise<Response> {
  try {
    return await fetchImpl(url, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams(form).toString(),
      signal: AbortSignal.timeout(15_000),
    });
  } catch (e) {
    throw new MailError(e instanceof Error && e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK", undefined, { cause: e });
  }
}

function parseTokenResponse(json: Record<string, unknown>, now: Date): TokenSet {
  const accessToken = json.access_token;
  if (typeof accessToken !== "string") throw new MailError("PROVIDER_UNAVAILABLE", "トークン応答が不正です");
  const expiresIn = typeof json.expires_in === "number" ? json.expires_in : 3600;
  return {
    accessToken,
    // 期限ぎりぎりの利用を避けるため60秒早める
    expiresAt: new Date(now.getTime() + Math.max(0, expiresIn - 60) * 1000),
    refreshToken: typeof json.refresh_token === "string" ? json.refresh_token : null,
    scopes: typeof json.scope === "string" ? json.scope.split(/\s+/).filter(Boolean) : [],
    idToken: typeof json.id_token === "string" ? json.id_token : null,
  };
}

export async function exchangeCode(
  cfg: GoogleOAuthConfig,
  p: { code: string; codeVerifier: string },
  fetchImpl: FetchLike = fetch,
  now = new Date(),
): Promise<TokenSet> {
  const res = await postForm(fetchImpl, TOKEN_ENDPOINT, {
    code: p.code,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    redirect_uri: cfg.redirectUri,
    grant_type: "authorization_code",
    code_verifier: p.codeVerifier,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    throw new MailError(res.status >= 500 ? "PROVIDER_UNAVAILABLE" : "UNAUTHENTICATED", "認可コードの交換に失敗しました", {
      detail: typeof json.error === "string" ? json.error : `status_${res.status}`,
    });
  }
  return parseTokenResponse(json, now);
}

export async function refreshAccessToken(
  cfg: GoogleOAuthConfig,
  refreshToken: string,
  fetchImpl: FetchLike = fetch,
  now = new Date(),
): Promise<TokenSet> {
  const res = await postForm(fetchImpl, TOKEN_ENDPOINT, {
    refresh_token: refreshToken,
    client_id: cfg.clientId,
    client_secret: cfg.clientSecret,
    grant_type: "refresh_token",
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) {
    const err = typeof json.error === "string" ? json.error : `status_${res.status}`;
    // invalid_grant：ユーザーによる取り消し・期限切れ（Testing状態の7日制限など）・パスワード変更
    if (err === "invalid_grant" || err === "unauthorized_client") {
      throw new MailError("REAUTH_REQUIRED", undefined, { detail: err });
    }
    throw new MailError(res.status >= 500 || res.status === 429 ? "PROVIDER_UNAVAILABLE" : "REAUTH_REQUIRED", undefined, {
      detail: err,
    });
  }
  return parseTokenResponse(json, now);
}

/** トークンの取り消し。失敗しても接続解除自体は続行する（呼び出し側で記録） */
export async function revokeToken(token: string, fetchImpl: FetchLike = fetch): Promise<boolean> {
  try {
    const res = await postForm(fetchImpl, REVOKE_ENDPOINT, { token });
    return res.ok;
  } catch {
    return false;
  }
}

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  subject: string;
}

/**
 * トークンエンドポイントからTLSで直接受け取った id_token は署名検証を省略できる（OIDC Core 3.1.3.7）。
 * ただし aud / iss / 期限は検証する。
 */
export function readIdToken(idToken: string, clientId: string, now = new Date()): GoogleIdentity {
  const claims = decodeJwt(idToken);
  const iss = claims.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    throw new MailError("UNAUTHENTICATED", "IDトークンの発行者が不正です");
  }
  const aud = Array.isArray(claims.aud) ? claims.aud : [claims.aud];
  if (!aud.includes(clientId)) throw new MailError("UNAUTHENTICATED", "IDトークンの宛先が不正です");
  if (typeof claims.exp === "number" && claims.exp * 1000 < now.getTime() - 60_000) {
    throw new MailError("UNAUTHENTICATED", "IDトークンの期限が切れています");
  }
  const email = claims.email;
  if (typeof email !== "string" || typeof claims.sub !== "string") {
    throw new MailError("UNAUTHENTICATED", "メールアドレスを取得できませんでした");
  }
  return { email: email.toLowerCase(), emailVerified: claims.email_verified === true, subject: claims.sub };
}

export function hasGmailScope(scopes: string[]): boolean {
  return scopes.includes(GMAIL_SCOPE);
}
