import "server-only";
import { webUrl } from "@/mail/core";
import { createWorker } from "@/mail/worker/app";
import type { Container } from "./container";

/**
 * 新着通知（Pub/Sub push）と定期ジョブの処理本体を、コンテナの設定から組み立てる。
 * Pub/Sub の audience は既定で push エンドポイントの URL（PUBSUB_AUDIENCE で上書き可）。
 */
export function workerFor(c: Container) {
  return createWorker({
    core: c.core,
    deliveries: c.repos.deliveries,
    logger: c.logger.child({ service: "mail-worker" }),
    config: {
      pubsubAudience: c.env.PUBSUB_AUDIENCE ?? webUrl("/api/pubsub/gmail", c.env.APP_ORIGIN).toString(),
      pubsubServiceAccounts: c.env.PUBSUB_SERVICE_ACCOUNTS,
      schedulerAudience: c.env.SCHEDULER_AUDIENCE,
      schedulerServiceAccounts: c.env.SCHEDULER_SERVICE_ACCOUNTS,
      cronSecret: c.env.CRON_SECRET,
    },
  });
}
