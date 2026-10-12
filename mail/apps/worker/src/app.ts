// 通知経路のサーバー側（Cloud Run 想定）。
//   POST /pubsub/gmail        Gmail watch → Pub/Sub push（OIDC検証）→ history 同期 → FCM
//   POST /jobs/renew-watches  Cloud Scheduler（毎日）→ watch 更新
//   POST /jobs/reconcile      Cloud Scheduler（15分ごと等）→ 取りこぼし補完・通知再試行・古い記録の掃除
//   GET  /healthz
// 一般公開の同期API（Web の /api/sync）とは分離し、Google の正規リクエストだけを受け付ける。
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { MailError } from "@synedge/mail-core";
import {
  decodeGmailPushData,
  verifyGoogleOidcToken,
  type CoreServices,
  type DeliveryRepository,
  type Logger,
  type PubSubPushBody,
} from "@synedge/mail-core/server";
import type { JWTVerifyGetKey } from "jose";

export interface WorkerConfig {
  pubsubAudience: string;
  pubsubServiceAccounts: string[];
  schedulerAudience: string;
  schedulerServiceAccounts: string[];
}

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

export function createHandler(deps: WorkerDeps) {
  const { core, config, logger } = deps;

  const auth = async (req: IncomingMessage, kind: "pubsub" | "scheduler") => {
    const expect =
      kind === "pubsub"
        ? { audience: config.pubsubAudience, serviceAccountEmails: config.pubsubServiceAccounts }
        : { audience: config.schedulerAudience, serviceAccountEmails: config.schedulerServiceAccounts };
    return deps.jwks
      ? verifyGoogleOidcToken(req.headers.authorization, expect, deps.jwks)
      : verifyGoogleOidcToken(req.headers.authorization, expect);
  };

  return async (req: IncomingMessage, res: ServerResponse) => {
    const correlationId = randomUUID();
    const log = logger.child({ correlationId });
    const path = (req.url ?? "/").split("?")[0];
    try {
      if (req.method === "GET" && path === "/healthz") return send(res, 200, { ok: true });

      if (req.method === "POST" && path === "/pubsub/gmail") {
        const a = await auth(req, "pubsub");
        if (!a.ok) {
          log.warn("pubsub.auth_failed", { reason: a.reason });
          return send(res, 401);
        }
        const body = JSON.parse(await readBody(req)) as PubSubPushBody;
        const event = decodeGmailPushData(body);
        if (!event) {
          // 形式不正は再送しても直らないため ACK（2xx）する
          log.warn("pubsub.bad_payload", { messageId: body.message?.messageId });
          return send(res, 204);
        }
        try {
          const r = await core.sync.handlePushEvent(event);
          log.info("pubsub.handled", { messageId: body.message?.messageId, outcome: r.outcome, notified: r.notified });
          // 別の同期が実行中：Pub/Sub に再送させ、取りこぼしを防ぐ
          if (r.outcome === "busy") return send(res, 503);
          return send(res, 204);
        } catch (e) {
          const retryable = !(e instanceof MailError) || e.retryable;
          log.error("pubsub.sync_failed", { messageId: body.message?.messageId, errorCode: e instanceof MailError ? e.code : "INTERNAL", retryable });
          // 一時障害は NACK（Pub/Sub が指数バックオフで再送）。恒久的な失敗は ACK し定期照合に任せる
          return send(res, retryable ? 503 : 204);
        }
      }

      if (req.method === "POST" && (path === "/jobs/renew-watches" || path === "/jobs/reconcile")) {
        const a = await auth(req, "scheduler");
        if (!a.ok) {
          log.warn("job.auth_failed", { reason: a.reason });
          return send(res, 401);
        }
        if (path === "/jobs/renew-watches") {
          const r = await core.sync.renewAllWatches();
          log.info("job.renew_watches", r);
          return send(res, r.failed > 0 ? 500 : 200, r);
        }
        const r = await core.sync.reconcileAll();
        const now = deps.now?.() ?? new Date();
        const purged = await deps.deliveries.purgeOlderThan(new Date(now.getTime() - DELIVERY_RETENTION_MS));
        log.info("job.reconcile", { ...r, purged });
        return send(res, r.failed > 0 ? 500 : 200, { ...r, purged });
      }

      return send(res, 404);
    } catch (e) {
      log.error("worker.unhandled", { error: e });
      return send(res, 500);
    }
  };
}
