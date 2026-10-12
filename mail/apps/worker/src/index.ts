import { createServer } from "node:http";
import { createPgRepositories, createSql } from "@synedge/database";
import { createCoreServices, createLogger } from "@synedge/mail-core/server";
import { z } from "zod";
import { createHandler } from "./app";

const list = z.string().transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean));

const env = z
  .object({
    PORT: z.coerce.number().default(8080),
    DATABASE_URL: z.string().min(1),
    TOKEN_ENCRYPTION_KEYS: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    APP_ORIGIN: z.string().url(),
    GMAIL_PUBSUB_TOPIC: z.string().regex(/^projects\/[^/]+\/topics\/[^/]+$/),
    // どちらか一方：鍵JSON（base64可）または Cloud Run のサービスアカウント（メタデータ）で認証する Firebase プロジェクトID
    FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
    FCM_PROJECT_ID: z.string().optional(),
    PUBSUB_AUDIENCE: z.string().url(),
    PUBSUB_SERVICE_ACCOUNTS: list,
    SCHEDULER_AUDIENCE: z.string().url(),
    SCHEDULER_SERVICE_ACCOUNTS: list,
  })
  .refine((e) => !!e.FCM_SERVICE_ACCOUNT_JSON || !!e.FCM_PROJECT_ID, "FCM_SERVICE_ACCOUNT_JSON または FCM_PROJECT_ID が必要です")
  .parse(process.env);

const logger = createLogger({ service: "worker" });
const repos = createPgRepositories(createSql(env.DATABASE_URL));
const core = createCoreServices(
  repos,
  {
    oauth: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: new URL("/api/auth/google/callback", env.APP_ORIGIN).toString(),
    },
    tokenEncryptionKeys: env.TOKEN_ENCRYPTION_KEYS,
    pubsubTopic: env.GMAIL_PUBSUB_TOPIC,
    fcmServiceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON || null,
    fcmProjectId: env.FCM_PROJECT_ID || null,
  },
  { logger },
);

const server = createServer(
  createHandler({
    core,
    deliveries: repos.deliveries,
    logger,
    config: {
      pubsubAudience: env.PUBSUB_AUDIENCE,
      pubsubServiceAccounts: env.PUBSUB_SERVICE_ACCOUNTS,
      schedulerAudience: env.SCHEDULER_AUDIENCE,
      schedulerServiceAccounts: env.SCHEDULER_SERVICE_ACCOUNTS,
    },
  }),
);
server.listen(env.PORT, () => logger.info("worker.started", { port: env.PORT }));

const shutdown = () => server.close(() => process.exit(0));
process.on("SIGTERM", shutdown);
process.on("SIGINT", shutdown);
