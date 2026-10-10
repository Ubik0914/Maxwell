// 構造化ログ。本文・件名・アドレス・認証情報は記録しない（仕様7章）。
// 誤って渡された場合に備え、キー名とトークン形の値をマスクする。

export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Logger {
  debug(event: string, fields?: Record<string, unknown>): void;
  info(event: string, fields?: Record<string, unknown>): void;
  warn(event: string, fields?: Record<string, unknown>): void;
  error(event: string, fields?: Record<string, unknown>): void;
  child(fields: Record<string, unknown>): Logger;
}

const SENSITIVE_KEY =
  /(token|secret|password|authorization|cookie|body|subject|snippet|html|text|email|address|^from$|^to$|^cc$|^bcc$|raw|code|key|credential|query|^q$)/i;
const SAFE_KEYS = new Set(["errorCode", "code_status", "statusCode", "correlationId", "accountId", "userId"]);
const JWT_LIKE = /eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/g;
const BEARER = /(Bearer\s+)[A-Za-z0-9._~+/-]+=*/gi;
const GOOGLE_TOKEN = /\b(ya29\.|1\/\/)[A-Za-z0-9._-]+/g;
const EMAIL_LIKE = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;

export function redactString(s: string): string {
  return s
    .replace(BEARER, "$1[REDACTED]")
    .replace(JWT_LIKE, "[REDACTED_JWT]")
    .replace(GOOGLE_TOKEN, "[REDACTED_TOKEN]")
    .replace(EMAIL_LIKE, "[REDACTED_EMAIL]");
}

export function redact(value: unknown, key = "", depth = 0): unknown {
  if (depth > 5) return "[TRUNCATED]";
  if (key && SENSITIVE_KEY.test(key) && !SAFE_KEYS.has(key)) return "[REDACTED]";
  if (typeof value === "string") return redactString(value).slice(0, 500);
  if (value instanceof Error) {
    return { name: value.name, message: redactString(value.message).slice(0, 500) };
  }
  if (Array.isArray(value)) return value.slice(0, 20).map((v) => redact(v, "", depth + 1));
  if (value && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = redact(v, k, depth + 1);
    return out;
  }
  return value;
}

const LEVELS: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(
  base: Record<string, unknown> = {},
  opts: { level?: LogLevel; sink?: (line: string, level: LogLevel) => void } = {},
): Logger {
  const min = LEVELS[opts.level ?? ((process.env.LOG_LEVEL as LogLevel | undefined) || "info")] ?? 20;
  const sink =
    opts.sink ??
    ((line: string, level: LogLevel) => {
      if (level === "error" || level === "warn") console.error(line);
      else process.stdout.write(line + "\n");
    });
  const write = (level: LogLevel, event: string, fields?: Record<string, unknown>) => {
    if (LEVELS[level] < min) return;
    const entry = { level, time: new Date().toISOString(), event, ...base, ...(redact(fields ?? {}) as object) };
    // Cloud Logging が解釈する severity を付ける
    sink(JSON.stringify({ severity: level.toUpperCase(), ...entry }), level);
  };
  return {
    debug: (e, f) => write("debug", e, f),
    info: (e, f) => write("info", e, f),
    warn: (e, f) => write("warn", e, f),
    error: (e, f) => write("error", e, f),
    child: (fields) => createLogger({ ...base, ...fields }, opts),
  };
}

export const silentLogger: Logger = {
  debug() {},
  info() {},
  warn() {},
  error() {},
  child() {
    return silentLogger;
  },
};
