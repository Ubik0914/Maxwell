// Gmail REST API の薄いHTTPクライアント。エラーを共通分類（MailError）へ変換する。
// 読み取り系（GET）は 429/5xx を指数バックオフで再試行する。送信系は自動再試行しない（二重送信防止）。
import { MailError, type ErrorCode } from "../../errors";
import { backoffDelay } from "../backoff";
import type { Clock } from "../ports";
import type { AccessTokenSource } from "../token-manager";

const BASE = "https://gmail.googleapis.com/gmail/v1/users/me";

export interface GmailClientOptions {
  tokens: AccessTokenSource;
  clock: Clock;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  maxRetries?: number;
}

export interface RequestOptions {
  method?: "GET" | "POST" | "PUT" | "DELETE";
  query?: Record<string, string | number | boolean | string[] | undefined>;
  body?: unknown;
  /** 結果が不明になり得る操作（送信）では false */
  retry?: boolean;
  timeoutMs?: number;
}

interface GoogleErrorBody {
  error?: { code?: number; message?: string; status?: string; errors?: { reason?: string }[] };
}

export class GmailClient {
  private readonly fetchImpl: typeof fetch;

  constructor(private readonly opts: GmailClientOptions) {
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  async request<T>(path: string, ro: RequestOptions = {}): Promise<T> {
    const method = ro.method ?? "GET";
    const retry = ro.retry ?? method === "GET";
    const maxRetries = retry ? (this.opts.maxRetries ?? 3) : 0;
    let refreshed = false;

    for (let attempt = 0; ; attempt++) {
      const token = await this.opts.tokens.getAccessToken({ forceRefresh: refreshed });
      let res: Response;
      try {
        res = await this.fetchImpl(buildUrl(path, ro.query), {
          method,
          headers: {
            authorization: `Bearer ${token}`,
            ...(ro.body !== undefined ? { "content-type": "application/json" } : {}),
          },
          body: ro.body !== undefined ? JSON.stringify(ro.body) : undefined,
          signal: AbortSignal.timeout(ro.timeoutMs ?? this.opts.timeoutMs ?? 20_000),
        });
      } catch (e) {
        const code: ErrorCode = e instanceof Error && e.name === "TimeoutError" ? "TIMEOUT" : "NETWORK";
        if (attempt < maxRetries) {
          await this.opts.clock.sleep(backoffDelay(attempt));
          continue;
        }
        throw new MailError(code, undefined, { cause: e });
      }

      if (res.ok) {
        if (res.status === 204) return undefined as T;
        const text = await res.text();
        return (text ? JSON.parse(text) : undefined) as T;
      }

      const body = (await res.json().catch(() => ({}))) as GoogleErrorBody;
      const err = mapGoogleError(res.status, body, res.headers.get("retry-after"));

      // 401 はトークン更新後に1回だけやり直す（送信でも安全：401はGoogle側で処理されていない）
      if (res.status === 401 && !refreshed) {
        refreshed = true;
        attempt--;
        continue;
      }
      if (err.retryable && attempt < maxRetries) {
        await this.opts.clock.sleep(err.retryAfterMs ?? backoffDelay(attempt));
        continue;
      }
      throw err;
    }
  }
}

function buildUrl(path: string, query?: RequestOptions["query"]): string {
  const url = new URL(BASE + path);
  for (const [k, v] of Object.entries(query ?? {})) {
    if (v === undefined) continue;
    if (Array.isArray(v)) v.forEach((item) => url.searchParams.append(k, item));
    else url.searchParams.set(k, String(v));
  }
  return url.toString();
}

export function mapGoogleError(status: number, body: GoogleErrorBody, retryAfter: string | null): MailError {
  const reasons = (body.error?.errors ?? []).map((e) => e.reason ?? "");
  const detail = [body.error?.status, ...reasons].filter(Boolean).join(",") || `status_${status}`;
  const retryAfterMs = retryAfter && /^\d+$/.test(retryAfter) ? Number(retryAfter) * 1000 : undefined;
  const opts = { detail, retryAfterMs };

  if (status === 401) return new MailError("REAUTH_REQUIRED", undefined, opts);
  if (status === 429) return new MailError("RATE_LIMITED", undefined, opts);
  if (status === 403) {
    if (reasons.some((r) => /rateLimitExceeded|userRateLimitExceeded|quotaExceeded/i.test(r))) {
      return new MailError("RATE_LIMITED", undefined, opts);
    }
    if (reasons.some((r) => /insufficientPermissions/i.test(r)) || body.error?.status === "PERMISSION_DENIED") {
      return new MailError("INSUFFICIENT_SCOPE", undefined, opts);
    }
    return new MailError("FORBIDDEN", undefined, opts);
  }
  if (status === 404) return new MailError("NOT_FOUND", undefined, opts);
  if (status === 400 || status === 422) return new MailError("INVALID_INPUT", undefined, opts);
  if (status === 409) return new MailError("CONFLICT", undefined, opts);
  if (status >= 500) return new MailError("PROVIDER_UNAVAILABLE", undefined, opts);
  return new MailError("INTERNAL", undefined, opts);
}
