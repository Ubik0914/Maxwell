// Google が発行する OIDC トークン（Pub/Sub push・Cloud Scheduler）の検証。
// 公開エンドポイントの正規リクエストだけを受け付けるため、署名・発行者・audience・サービスアカウントを検証する。
import { createRemoteJWKSet, jwtVerify, type JWTVerifyGetKey } from "jose";

const GOOGLE_JWKS_URL = new URL("https://www.googleapis.com/oauth2/v3/certs");
let defaultJwks: JWTVerifyGetKey | null = null;

export interface OidcExpectation {
  audience: string;
  /** 許可するサービスアカウントのメールアドレス */
  serviceAccountEmails: string[];
}

export async function verifyGoogleOidcToken(
  authorization: string | null | undefined,
  expect: OidcExpectation,
  jwks: JWTVerifyGetKey = (defaultJwks ??= createRemoteJWKSet(GOOGLE_JWKS_URL)),
): Promise<{ ok: true; email: string } | { ok: false; reason: string }> {
  const m = /^Bearer\s+(.+)$/i.exec(authorization ?? "");
  if (!m) return { ok: false, reason: "missing_bearer" };
  try {
    const { payload } = await jwtVerify(m[1]!, jwks, {
      issuer: ["https://accounts.google.com", "accounts.google.com"],
      audience: expect.audience,
      algorithms: ["RS256"],
    });
    const email = typeof payload.email === "string" ? payload.email : "";
    if (payload.email_verified !== true) return { ok: false, reason: "email_not_verified" };
    if (!expect.serviceAccountEmails.includes(email)) return { ok: false, reason: "unexpected_service_account" };
    return { ok: true, email };
  } catch (e) {
    return { ok: false, reason: e instanceof Error ? e.name : "verify_failed" };
  }
}

export interface PubSubPushBody {
  message?: { data?: string; messageId?: string; attributes?: Record<string, string> };
  subscription?: string;
}

/** Gmail の Pub/Sub 通知データ { emailAddress, historyId } を取り出す */
export function decodeGmailPushData(body: PubSubPushBody): { emailAddress: string; historyId: string } | null {
  const data = body.message?.data;
  if (!data) return null;
  try {
    const parsed = JSON.parse(Buffer.from(data, "base64").toString("utf8")) as { emailAddress?: unknown; historyId?: unknown };
    if (typeof parsed.emailAddress !== "string") return null;
    const historyId = typeof parsed.historyId === "number" ? String(parsed.historyId) : parsed.historyId;
    if (typeof historyId !== "string" || !/^\d+$/.test(historyId)) return null;
    return { emailAddress: parsed.emailAddress, historyId };
  } catch {
    return null;
  }
}
