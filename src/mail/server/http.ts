import "server-only";
import { randomUUID } from "node:crypto";
import { MailError, USER_MESSAGES, type ApiErrorBody, type ErrorCode } from "@/mail/core";
import { NextResponse, type NextRequest } from "next/server";
import { getContainer, type Container } from "./container";
import { getSession, type Session } from "./session";

export interface HandlerContext {
  req: NextRequest;
  c: Container;
  session: Session;
  correlationId: string;
}

export interface RouteOptions {
  /** 状態を変える操作（Origin検証の対象） */
  mutating?: boolean;
  rateLimit?: keyof Container["limits"];
}

export function json(data: unknown, init?: ResponseInit) {
  return NextResponse.json(data, init);
}

export function errorResponse(code: ErrorCode, correlationId: string, message?: string, extraHeaders?: Record<string, string>) {
  const body: ApiErrorBody = { error: { code, message: message ?? USER_MESSAGES[code], correlationId } };
  return NextResponse.json(body, { status: new MailError(code).httpStatus, headers: extraHeaders });
}

/**
 * CSRF対策：状態を変える要求は自サイトの Origin からのものだけ受け付ける。
 * Cookie は SameSite=Lax だが、それだけに頼らない。
 * Bearer トークンで来る要求（MCP・CLI）は Cookie を使わないので CSRF の対象外。
 */
export function checkOrigin(req: NextRequest, c: Container): boolean {
  if (/^Bearer\s+\S+/i.test(req.headers.get("authorization") ?? "")) return true;
  const origin = req.headers.get("origin");
  if (!origin) return false;
  return origin === new URL(c.env.APP_ORIGIN).origin;
}

function userMessage(e: MailError): string {
  // 入力検証や送信失敗の文言は自前で作った利用者向けの日本語なので表示してよい
  if ((e.code === "INVALID_INPUT" || e.code === "SEND_FAILED") && e.message !== e.code) return e.message;
  return USER_MESSAGES[e.code];
}

export function route<P>(
  handler: (h: HandlerContext, params: P) => Promise<Response>,
  opts: RouteOptions = {},
) {
  return async (req: NextRequest, ctx: { params: Promise<P> }): Promise<Response> => {
    const correlationId = randomUUID();
    let c: Container;
    try {
      c = getContainer();
    } catch (e) {
      console.error(JSON.stringify({ severity: "ERROR", event: "container_init_failed", message: (e as Error).message }));
      return errorResponse("INTERNAL", correlationId);
    }
    const log = c.logger.child({ correlationId, path: req.nextUrl.pathname });
    try {
      if (opts.mutating && !checkOrigin(req, c)) return errorResponse("FORBIDDEN", correlationId);
      const session = await getSession(c, req);
      if (!session) return errorResponse("UNAUTHENTICATED", correlationId);
      const limiter = c.limits[opts.rateLimit ?? "default"];
      const rl = limiter.take(session.userId);
      if (!rl.ok) {
        return errorResponse("RATE_LIMITED", correlationId, undefined, { "retry-after": String(Math.ceil(rl.retryAfterMs / 1000)) });
      }
      return await handler({ req, c, session, correlationId }, await ctx.params);
    } catch (e) {
      if (e instanceof MailError) {
        if (e.httpStatus >= 500) log.warn("api.error", { errorCode: e.code, detail: e.detail });
        return errorResponse(e.code, correlationId, userMessage(e));
      }
      log.error("api.unhandled", { error: e });
      return errorResponse("INTERNAL", correlationId);
    }
  };
}

export async function readJson(req: NextRequest, maxBytes = 512 * 1024): Promise<unknown> {
  const type = req.headers.get("content-type") ?? "";
  if (!type.toLowerCase().startsWith("application/json")) throw new MailError("INVALID_INPUT", "Content-Type は application/json にしてください");
  const text = await req.text();
  if (text.length > maxBytes) throw new MailError("INVALID_INPUT", "リクエストが大きすぎます");
  try {
    return text ? JSON.parse(text) : {};
  } catch {
    throw new MailError("INVALID_INPUT", "JSONの形式が正しくありません");
  }
}

export function searchParamsObject(req: NextRequest): Record<string, string> {
  return Object.fromEntries(req.nextUrl.searchParams.entries());
}
