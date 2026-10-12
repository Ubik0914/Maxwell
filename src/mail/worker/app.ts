// 通知経路のサーバー側。Maxwell の API route（src/app/mail/api/pubsub・jobs）から呼ぶ。
//   POST /mail/api/pubsub/gmail        Gmail watch → Pub/Sub push（OIDC検証）→ history 同期 → FCM
//   GET|POST /mail/api/jobs/renew-watches  Vercel Cron（毎日）または Cloud Scheduler → watch 更新
//   GET|POST /mail/api/jobs/reconcile      同上（取りこぼし補完・通知再試行・古い記録の掃除）
// 一般公開の同期API（/mail/api/sync）とは分離し、Google の正規リクエストと Cron だけを受け付ける。
// 処理本体（createWorker）は HTTP の形に依存しない。createHandler は node:http 用の薄い包み（テスト用）。
import { randomUUID, timingSafeEqual } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MailError } from "@/mail/core";
import {
  decodeGmailPushData,
  verifyGoogleOidcToken,
  type CoreServices,
  type DeliveryRepository,
  type Logger,
  type PubSubPushBody,
} from "@/mail/core/server";
import type { JWTVerifyGetKey } from "jose";

export interface WorkerConfig {
  pubsubAudience: string;
  pubsubServiceAccounts: string[];
  /** Cloud Scheduler から呼ぶ場合（任意） */
  schedulerAudience?: string;
  schedulerServiceAccounts?: string[];
  /** Vercel Cron が `Authorization: Bearer <CRON_SECRET>` を付けて呼ぶ（任意） */
  cronSecret?: string;
}

export interface WorkerResult {
  status: number;
  body?: unknown;
}

export type JobName = "renew-watches" | "reconcile";

export interface WorkerDeps {
  core: CoreServices;
  deliveries: DeliveryRepository;
  config: WorkerConfig;
  logger: Logger;
  jwks?: JWTVerifyGetKey;
  now?: () => Date;
}

const MAX_BODY = 64 * 1024;
const DELIVERY_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

async function readBody(req: IncomingMessage): Promise<string> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > MAX_BODY) throw new Error("body_too_large");
    chunks.push(chunk as Buffer);
  }
  return Buffer.concat(chunks).toString("utf8");
}

function send(res: ServerResponse, status: number, body?: unknown) {
  res.statusCode = status;
  if (body === undefined) return res.end();
  res.setHeader("content-type", "application/json");
  res.end(JSON.stringify(body));
}

function sameSecret(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

export function createWorker(deps: WorkerDeps) {
  const { core, config, logger } = deps;

  const verify = (authorization: string | null | undefined, expect: { audience: string; serviceAccountEmails: string[] }) =>
    deps.jwks
      ? verifyGoogleOidcToken(authorization ?? undefined, expect, deps.jwks)
      : verifyGoogleOidcToken(authorization ?? undefined, expect);

  const jobAuthorized = async (authorization: string | null | undefined): Promise<{ ok: boolean; reason?: string }> => {
    const bearer = authorization?.match(/^Bearer\s+(.+)$/i)?.[1];
    if (config.cronSecret && bearer && sameSecret(bearer, config.cronSecret)) return { ok: true };
    if (config.schedulerAudience && config.schedulerServiceAccounts?.length) {
      const a = await verify(authorization, { audience: config.schedulerAudience, serviceAccountEmails: config.schedulerServiceAccounts });
      return a.ok ? { ok: true } : { ok: false, reason: a.reason };
    }
    return { ok: false, reason: config.cronSecret ? "bad_cron_secret" : "not_configured" };
  };

  async function pubsub(authorization: string | null | undefined, rawBody: string): Promise<WorkerResult> {
    const log = logger.child({ correlationId: randomUUID() });
    const a = await verify(authorization, { audience: config.pubsubAudience, serviceAccountEmails: config.pubsubServiceAccounts });
    if (!a.ok) {
      log.warn("pubsub.auth_failed", { reason: a.reason });
      return { status: 401 };
    }
    if (rawBody.length > MAX_BODY) return { status: 413 };
    let body: PubSubPushBody;
    try {
      body = JSON.parse(rawBody) as PubSubPushBody;
    } catch {
      return { status: 204 };
    }
    const event = decodeGmailPushData(body);
    if (!event) {
      // 形式不正は再送しても直らないため ACK（2xx）する
      log.warn("pubsub.bad_payload", { messageId: body.message?.messageId });
      return { status: 204 };
    }
    try {
      const r = await core.sync.handlePushEvent(event);
      log.info("pubsub.handled", { messageId: body.message?.messageId, outcome: r.outcome, notified: r.notified });
      // 別の同期が実行中：Pub/Sub に再送させ、取りこぼしを防ぐ
      if (r.outcome === "busy") return { status: 503 };
      return { status: 204 };
    } catch (e) {
      const retryable = !(e instanceof MailError) || e.retryable;
      log.error("pubsub.sync_failed", { messageId: body.message?.messageId, errorCode: e instanceof MailError ? e.code : "INTERNAL", retryable });
      // 一時障害は NACK（Pub/Sub が指数バックオフで再送）。恒久的な失敗は ACK し定期照合に任せる
      return { status: retryable ? 503 : 204 };
    }
  }

  async function job(name: JobName, authorization: string | null | undefined): Promise<WorkerResult> {
    const log = logger.child({ correlationId: randomUUID() });
    const a = await jobAuthorized(authorization);
    if (!a.ok) {
      log.warn("job.auth_failed", { reason: a.reason });
      return { status: 401 };
    }
    if (name === "renew-watches") {
      const r = await core.sync.renewAllWatches();
      log.info("job.renew_watches", r);
      return { status: r.failed > 0 ? 500 : 200, body: r };
    }
    const r = await core.sync.reconcileAll();
    const now = deps.now?.() ?? new Date();
    const purged = await deps.deliveries.purgeOlderThan(new Date(now.getTime() - DELIVERY_RETENTION_MS));
    log.info("job.reconcile", { ...r, purged });
    return { status: r.failed > 0 ? 500 : 200, body: { ...r, purged } };
  }

  return { pubsub, job };
}

/** node:http 用の包み（テストで HTTP の形を確かめるため） */
export function createHandler(deps: WorkerDeps) {
  const worker = createWorker(deps);
  return async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];
    try {
      if (req.method === "GET" && path === "/healthz") return send(res, 200, { ok: true });
      if (req.method === "POST" && path === "/pubsub/gmail") {
        const r = await worker.pubsub(req.headers.authorization, await readBody(req));
        return send(res, r.status, r.body);
      }
      if (req.method === "POST" && (path === "/jobs/renew-watches" || path === "/jobs/reconcile")) {
        const r = await worker.job(path === "/jobs/renew-watches" ? "renew-watches" : "reconcile", req.headers.authorization);
        return send(res, r.status, r.body);
      }
      return send(res, 404);
    } catch (e) {
      deps.logger.error("worker.unhandled", { error: e });
      return send(res, 500);
    }
  };
}
