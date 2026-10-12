import "server-only";
import { createPgRepositories, createSql, type AppRepositories } from "@synedge/database";
import {
  createCoreServices,
  createLogger,
  RateLimiter,
  type CoreServices,
  type GoogleOAuthConfig,
  type Logger,
  type Repositories,
} from "@synedge/mail-core/server";
import { getEnv, type Env } from "./env";

export interface Container {
  env: Env;
  repos: Repositories & AppRepositories;
  core: CoreServices;
  oauth: GoogleOAuthConfig;
  logger: Logger;
  limits: Record<"default" | "send" | "sync" | "auth", RateLimiter>;
  fetchImpl: typeof fetch;
  now: () => Date;
}

let container: Container | null = null;

export function createLimits(): Container["limits"] {
  return {
    default: new RateLimiter(120, 2),
    send: new RateLimiter(5, 0.1),
    sync: new RateLimiter(2, 1 / 30),
    auth: new RateLimiter(10, 0.2),
  };
}

export function getContainer(): Container {
  if (container) return container;
  const env = getEnv();
  const logger = createLogger({ service: "web" });
  const sql = createSql(env.DATABASE_URL);
  const repos = createPgRepositories(sql);
  const oauth = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: new URL("/api/auth/google/callback", env.APP_ORIGIN).toString(),
  };
  const core = createCoreServices(
    repos,
    {
      oauth,
      tokenEncryptionKeys: env.TOKEN_ENCRYPTION_KEYS,
      pubsubTopic: env.GMAIL_PUBSUB_TOPIC ?? null,
      fcmServiceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON || null,
    },
    { logger },
  );
  container = { env, repos, core, oauth, logger, limits: createLimits(), fetchImpl: fetch, now: () => new Date() };
  return container;
}

/** テスト用 */
export function setContainer(c: Container | null) {
  container = c;
}
