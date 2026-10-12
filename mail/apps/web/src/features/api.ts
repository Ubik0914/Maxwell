// ブラウザ側の API クライアント。秘密情報は扱わず、サーバーの共通エラー形式を解釈する。
import { USER_MESSAGES, webPath, type ApiErrorBody, type ErrorCode } from "@synedge/mail-core";

export class ApiError extends Error {
  constructor(
    readonly code: ErrorCode,
    message: string,
    readonly status: number,
    readonly correlationId?: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

export interface ApiOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  signal?: AbortSignal;
}

/** path はアプリ内パス（"/api/..."）。basePath はここで付ける */
export async function api<T>(path: string, opts: ApiOptions = {}): Promise<T> {
  let res: Response;
  try {
    res = await fetch(webPath(path), {
      method: opts.method ?? "GET",
      credentials: "same-origin",
      headers: opts.body !== undefined ? { "content-type": "application/json" } : undefined,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
      signal: opts.signal,
      cache: "no-store",
    });
  } catch (e) {
    if (e instanceof DOMException && e.name === "AbortError") throw e;
    throw new ApiError("NETWORK", USER_MESSAGES.NETWORK, 0);
  }
  if (res.ok) return (await res.json()) as T;
  const body = (await res.json().catch(() => null)) as ApiErrorBody | null;
  const code = body?.error?.code ?? (res.status === 401 ? "UNAUTHENTICATED" : "INTERNAL");
  const err = new ApiError(code, body?.error?.message ?? USER_MESSAGES[code], res.status, body?.error?.correlationId);
  if (code === "UNAUTHENTICATED" && typeof window !== "undefined") {
    const next = window.location.pathname + window.location.search;
    window.location.assign(webPath(`/login?next=${encodeURIComponent(next)}`));
  }
  return Promise.reject(err);
}

export function errorMessage(e: unknown): string {
  if (e instanceof ApiError) return e.message;
  return USER_MESSAGES.INTERNAL;
}
