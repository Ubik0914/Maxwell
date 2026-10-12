import "server-only";
import { createPgRepositories, createSql } from "@/mail/database";
import { webUrl } from "@/mail/core";
import {
  createCoreServices,
  createLogger,
  RateLimiter,
  type CoreServices,
  type GoogleOAuthConfig,
  type Logger,
  type Repositories,
} from "@/mail/core/server";
import { getEnv, type Env } from "./env";
import type { AuthPort } from "./session";
import { supabaseAuth } from "./supabase-auth";

export interface Container {
  env: Env;
  repos: Repositories;
  auth: AuthPort;
  core: CoreServices;
  oauth: GoogleOAuthConfig;
  logger: Logger;
  limits: Record<"default" | "send" | "sync" | "auth", RateLimiter>;
  fetchImpl: typeof fetch;
  now: () => Date;
}

let container: Container | null = null;

/** 画面用：メールの設定がなければ null（画面は「まだ使えません」を出す） */
export function tryGetContainer(): Container | null {
  try {
    return getContainer();
  } catch {
    return null;
  }
}

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
  const sql = createSql(env.MAIL_DATABASE_URL);
  const repos = createPgRepositories(sql);
  const oauth = {
    clientId: env.GOOGLE_CLIENT_ID,
    clientSecret: env.GOOGLE_CLIENT_SECRET,
    redirectUri: webUrl("/api/auth/google/callback", env.APP_ORIGIN).toString(),
  };
  const core = createCoreServices(
    repos,
    {
      oauth,
      tokenEncryptionKeys: env.MAIL_TOKEN_ENCRYPTION_KEYS,
      pubsubTopic: env.GMAIL_PUBSUB_TOPIC ?? null,
      fcmServiceAccountJson: env.FCM_SERVICE_ACCOUNT_JSON || null,
    },
    { logger },
  );
  container = { env, repos, auth: supabaseAuth, core, oauth, logger, limits: createLimits(), fetchImpl: fetch, now: () => new Date() };
  return container;
}

/** テスト用 */
export function setContainer(c: Container | null) {
  container = c;
}
