// Firebase Cloud Messaging HTTP v1 送信。サービスアカウント鍵はサーバー側の秘密管理にのみ置く。
import { importPKCS8, SignJWT } from "jose";
import { NOTIFICATION_CHANNEL_ID } from "./notification-service";
import type { PushMessage, PushResult, PushSender } from "./ports";

export interface ServiceAccountKey {
  project_id: string;
  client_email: string;
  private_key: string;
}

export function parseServiceAccount(json: string): ServiceAccountKey {
  // base64 でも JSON 文字列でも受け付ける（環境変数に入れやすくするため）
  const text = json.trim().startsWith("{") ? json : Buffer.from(json, "base64").toString("utf8");
  const parsed = JSON.parse(text) as Partial<ServiceAccountKey>;
  if (!parsed.project_id || !parsed.client_email || !parsed.private_key) {
    throw new Error("FCMサービスアカウントJSONに project_id / client_email / private_key がありません");
  }
  return parsed as ServiceAccountKey;
}

const SCOPE = "https://www.googleapis.com/auth/firebase.messaging";
const TOKEN_URL = "https://oauth2.googleapis.com/token";

/** FCM 送信用アクセストークンの取得方法 */
export type FcmCredentials =
  | { kind: "service_account"; key: ServiceAccountKey }
  /** Cloud Run 等のメタデータサーバー（鍵ファイル不要。実行サービスアカウントに FCM 送信権限を付与する） */
  | { kind: "metadata"; projectId: string };

const METADATA_TOKEN_URL =
  "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token?scopes=" + encodeURIComponent(SCOPE);

export class FcmSender implements PushSender {
  private cached: { token: string; expiresAt: number } | null = null;
  private readonly projectId: string;

  constructor(
    private readonly creds: FcmCredentials | ServiceAccountKey,
    private readonly fetchImpl: typeof fetch = fetch,
  ) {
    const c = this.normalized();
    this.projectId = c.kind === "metadata" ? c.projectId : c.key.project_id;
  }

  private normalized(): FcmCredentials {
    return "kind" in this.creds ? this.creds : { kind: "service_account", key: this.creds };
  }

  private async accessToken(): Promise<string> {
    const now = Date.now();
    if (this.cached && this.cached.expiresAt - 60_000 > now) return this.cached.token;
    const c = this.normalized();
    let res: Response;
    if (c.kind === "metadata") {
      res = await this.fetchImpl(METADATA_TOKEN_URL, { headers: { "Metadata-Flavor": "Google" }, signal: AbortSignal.timeout(5_000) });
    } else {
      const pk = await importPKCS8(c.key.private_key, "RS256");
      const assertion = await new SignJWT({ scope: SCOPE })
        .setProtectedHeader({ alg: "RS256", typ: "JWT" })
        .setIssuer(c.key.client_email)
        .setSubject(c.key.client_email)
        .setAudience(TOKEN_URL)
        .setIssuedAt()
        .setExpirationTime("1h")
        .sign(pk);
      res = await this.fetchImpl(TOKEN_URL, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
    }
    const json = (await res.json().catch(() => ({}))) as { access_token?: string; expires_in?: number };
    if (!res.ok || !json.access_token) throw new Error(`fcm_auth_failed_${res.status}`);
    this.cached = { token: json.access_token, expiresAt: now + (json.expires_in ?? 3600) * 1000 };
    return json.access_token;
  }

  async send(token: string, message: PushMessage): Promise<PushResult> {
    let auth: string;
    try {
      auth = await this.accessToken();
    } catch (e) {
      return { ok: false, kind: "retryable", errorCode: e instanceof Error ? e.message.slice(0, 60) : "fcm_auth_failed" };
    }
    let res: Response;
    try {
      res = await this.fetchImpl(`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(this.projectId)}/messages:send`, {
        method: "POST",
        headers: { authorization: `Bearer ${auth}`, "content-type": "application/json" },
        body: JSON.stringify(buildFcmPayload(token, message)),
        signal: AbortSignal.timeout(10_000),
      });
    } catch {
      return { ok: false, kind: "retryable", errorCode: "network" };
    }
    if (res.ok) return { ok: true };
    const body = (await res.json().catch(() => ({}))) as {
      error?: { status?: string; message?: string; details?: { "@type"?: string; errorCode?: string }[] };
    };
    return classifyFcmError(res.status, body);
  }
}

export function buildFcmPayload(token: string, message: PushMessage) {
  return {
    message: {
      token,
      // notification ペイロード：アプリ終了中でもOSが通知を表示する
      notification: { title: message.title, body: message.body },
      data: message.data,
      android: {
        priority: "HIGH",
        ttl: "86400s",
        notification: {
          channel_id: NOTIFICATION_CHANNEL_ID,
          tag: message.tag,
          // プレビュー非表示設定でもロック画面での露出を抑える
          visibility: "PRIVATE",
        },
      },
    },
  };
}

export function classifyFcmError(
  status: number,
  body: { error?: { status?: string; message?: string; details?: { errorCode?: string }[] } },
): PushResult {
  const fcmCode = body.error?.details?.find((d) => d.errorCode)?.errorCode ?? body.error?.status ?? `http_${status}`;
  if (fcmCode === "UNREGISTERED" || (status === 404 && fcmCode !== "SENDER_ID_MISMATCH")) {
    return { ok: false, kind: "invalid_token", errorCode: fcmCode };
  }
  if (fcmCode === "INVALID_ARGUMENT" && status === 400 && /registration token/i.test(body.error?.message ?? "")) {
    // 不正な登録トークンも INVALID_ARGUMENT になる（ペイロード不正と区別するため文言で判定）
    return { ok: false, kind: "invalid_token", errorCode: fcmCode };
  }
  if (status === 429 || status >= 500 || fcmCode === "UNAVAILABLE" || fcmCode === "INTERNAL" || fcmCode === "QUOTA_EXCEEDED") {
    return { ok: false, kind: "retryable", errorCode: fcmCode };
  }
  return { ok: false, kind: "fatal", errorCode: fcmCode };
}

/** FCM未設定時に使う送信器（送らずに失敗として記録する。黙って成功扱いにしない） */
export const unconfiguredPushSender: PushSender = {
  async send() {
    return { ok: false, kind: "fatal", errorCode: "fcm_not_configured" };
  },
};
