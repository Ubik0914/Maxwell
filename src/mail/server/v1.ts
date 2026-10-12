import "server-only";
import { MailError, firstIssueMessage } from "@/mail/core";
import type { z } from "zod";
import { json, route, type HandlerContext, type RouteOptions } from "./http";

/**
 * /api/v1/mail/* 用の包み。Maxwell の /api/v1 と同じく成功は `{ data }`、失敗は `{ error: { code, message } }`。
 * 認証は route() と同じ（Bearer トークンまたは Supabase の Cookie）。MCP サーバーはこの API のクライアント。
 */
export function v1Route<P>(handler: (h: HandlerContext, params: P) => Promise<unknown>, opts: RouteOptions = {}) {
  return route<P>(async (h, params) => json({ data: await handler(h, params) }), opts);
}

export function parseInput<S extends z.ZodType>(schema: S, input: unknown): z.infer<S> {
  const r = schema.safeParse(input);
  if (!r.success) throw new MailError("INVALID_INPUT", firstIssueMessage(r.error));
  return r.data;
}
