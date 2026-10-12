// 共通エラー分類（仕様11章）。UIへは code とユーザー向け文言だけを渡す。

export const ERROR_CODES = [
  "UNAUTHENTICATED",
  "NOT_CONNECTED",
  "REAUTH_REQUIRED",
  "INSUFFICIENT_SCOPE",
  "FORBIDDEN",
  "RATE_LIMITED",
  "PROVIDER_UNAVAILABLE",
  "NETWORK",
  "TIMEOUT",
  "NOT_FOUND",
  "INVALID_INPUT",
  "SEND_FAILED",
  "SEND_STATUS_UNKNOWN",
  "SEND_IN_PROGRESS",
  "UNSUPPORTED",
  "CURSOR_EXPIRED",
  "CONFLICT",
  "INTERNAL",
] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

const HTTP_STATUS: Record<ErrorCode, number> = {
  UNAUTHENTICATED: 401,
  NOT_CONNECTED: 409,
  REAUTH_REQUIRED: 401,
  INSUFFICIENT_SCOPE: 403,
  FORBIDDEN: 403,
  RATE_LIMITED: 429,
  PROVIDER_UNAVAILABLE: 503,
  NETWORK: 503,
  TIMEOUT: 504,
  NOT_FOUND: 404,
  INVALID_INPUT: 400,
  SEND_FAILED: 502,
  SEND_STATUS_UNKNOWN: 502,
  SEND_IN_PROGRESS: 409,
  UNSUPPORTED: 501,
  CURSOR_EXPIRED: 410,
  CONFLICT: 409,
  INTERNAL: 500,
};

const RETRYABLE = new Set<ErrorCode>(["RATE_LIMITED", "PROVIDER_UNAVAILABLE", "NETWORK", "TIMEOUT"]);

export class MailError extends Error {
  readonly code: ErrorCode;
  readonly retryable: boolean;
  /** ログ用の補足（秘密情報・本文を入れない） */
  readonly detail: string | undefined;
  readonly retryAfterMs: number | undefined;

  constructor(code: ErrorCode, message?: string, opts: { detail?: string; retryAfterMs?: number; cause?: unknown } = {}) {
    super(message ?? code, opts.cause === undefined ? undefined : { cause: opts.cause });
    this.name = "MailError";
    this.code = code;
    this.retryable = RETRYABLE.has(code);
    this.detail = opts.detail;
    this.retryAfterMs = opts.retryAfterMs;
  }

  get httpStatus(): number {
    return HTTP_STATUS[this.code];
  }
}

export function isMailError(e: unknown): e is MailError {
  return e instanceof MailError;
}

export function httpStatusFor(code: ErrorCode): number {
  return HTTP_STATUS[code];
}

/** APIの共通エラー形式 */
export interface ApiErrorBody {
  error: { code: ErrorCode; message: string; correlationId?: string };
}

/** ユーザーが次に何をすべきか分かる文言（仕様11章） */
export const USER_MESSAGES: Record<ErrorCode, string> = {
  UNAUTHENTICATED: "ログインが必要です。もう一度ログインしてください。",
  NOT_CONNECTED: "Gmailが接続されていません。設定からGoogleアカウントを接続してください。",
  REAUTH_REQUIRED: "Googleの認証が切れました。設定から再接続してください。",
  INSUFFICIENT_SCOPE: "Gmailへのアクセス権限が足りません。再接続し、同意画面ですべての権限を許可してください。",
  FORBIDDEN: "この操作は許可されていません。",
  RATE_LIMITED: "Gmailへのリクエストが集中しています。少し待ってから再試行してください。",
  PROVIDER_UNAVAILABLE: "Gmailが一時的に応答していません。少し待ってから再試行してください。",
  NETWORK: "ネットワークに接続できません。接続を確認してから再試行してください。",
  TIMEOUT: "応答がタイムアウトしました。再試行してください。",
  NOT_FOUND: "メールが見つかりません。削除または移動された可能性があります。",
  INVALID_INPUT: "入力内容に誤りがあります。",
  SEND_FAILED: "送信できませんでした。内容を確認して再度送信してください。",
  SEND_STATUS_UNKNOWN:
    "送信できたか確認できませんでした。二重送信を防ぐため自動再送はしません。送信済みを確認してから操作してください。",
  SEND_IN_PROGRESS: "このメールは送信処理中です。完了を待ってください。",
  UNSUPPORTED: "このメールアカウントではこの操作に対応していません。",
  CURSOR_EXPIRED: "同期位置が古くなったため再同期します。",
  CONFLICT: "他の操作と競合しました。再読み込みしてください。",
  INTERNAL: "予期しないエラーが発生しました。時間をおいて再試行してください。",
};
