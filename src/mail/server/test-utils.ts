// Web API テスト用のコンテナ（インメモリDB + 擬似Gmail/Google OAuth）
import { createCoreServices, silentLogger, tokenAad } from "@/mail/core/server";
import { createMemoryRepositories, FakeClock, FakeGmail, RecordingPushSender, testEncryptionKeys } from "@/mail/core/testing";
import { SignJWT } from "jose";
import { NextRequest } from "next/server";
import { createLimits, setContainer, type Container } from "./container";
import type { Env } from "./env";
import type { AuthPort } from "./session";

/** テストでは Supabase の代わりに、この Cookie の値（ユーザーID）でログイン中の利用者を決める */
export const TEST_USER_COOKIE = "test_user";

export const ORIGIN = "https://app.example.com";

export async function createTestContainer(opts: { allowed?: string[] } = {}) {
  const clock = new FakeClock(new Date());
  const repos = createMemoryRepositories(() => clock.now());
  // Supabase Auth の代わり：ログイン中の利用者（id → email）
  const users = new Map<string, string>();
  const auth: AuthPort = {
    async currentUser(req) {
      const id = req?.cookies.get(TEST_USER_COOKIE)?.value;
      const email = id ? users.get(id) : undefined;
      return id && email ? { id, email } : null;
    },
  };
  const gmail = new FakeGmail("me@example.com");
  const push = new RecordingPushSender();
  const revoked: string[] = [];
  const google = { idTokenEmail: "me@example.com", scope: "openid email https://www.googleapis.com/auth/gmail.modify" };

  // Google のトークンエンドポイント（認可コード交換・取り消し）を模擬する
  const fetchImpl: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    if (url.hostname === "oauth2.googleapis.com") {
      const form = new URLSearchParams(String(init?.body ?? ""));
      if (url.pathname === "/revoke") {
        revoked.push(form.get("token") ?? "");
        return new Response("", { status: 200 });
      }
      if (form.get("grant_type") === "authorization_code") {
        if (form.get("code") !== "good-code" || !form.get("code_verifier")) {
          return Response.json({ error: "invalid_grant" }, { status: 400 });
        }
        const idToken = await new SignJWT({ email: google.idTokenEmail, email_verified: true })
          .setProtectedHeader({ alg: "HS256" })
          .setIssuer("https://accounts.google.com")
          .setAudience("client-id")
          .setSubject("google-sub")
          .setExpirationTime("1h")
          .sign(new TextEncoder().encode("x".repeat(32)));
        return Response.json({ access_token: "access-1", refresh_token: gmail.refreshToken, expires_in: 3600, scope: google.scope, id_token: idToken });
      }
    }
    return gmail.fetch(input, init);
  };

  const env: Env = {
    APP_ORIGIN: ORIGIN,
    MAIL_OAUTH_SECRET: "s".repeat(40),
    MAIL_ALLOWED_EMAILS: opts.allowed ?? ["me@example.com"],
    GOOGLE_CLIENT_ID: "client-id",
    GOOGLE_CLIENT_SECRET: "client-secret",
    MAIL_TOKEN_ENCRYPTION_KEYS: testEncryptionKeys(),
    MAIL_DATABASE_URL: "memory",
    GMAIL_PUBSUB_TOPIC: "projects/p/topics/gmail",
    FCM_SERVICE_ACCOUNT_JSON: undefined,
    ANDROID_APP_SCHEME: "synedge",
    PUBSUB_AUDIENCE: undefined,
    PUBSUB_SERVICE_ACCOUNTS: [],
    CRON_SECRET: undefined,
    SCHEDULER_AUDIENCE: undefined,
    SCHEDULER_SERVICE_ACCOUNTS: [],
  };
  const oauth = { clientId: env.GOOGLE_CLIENT_ID, clientSecret: env.GOOGLE_CLIENT_SECRET, redirectUri: `${ORIGIN}/mail/api/auth/google/callback` };
  const core = createCoreServices(
    repos,
    { oauth, tokenEncryptionKeys: env.MAIL_TOKEN_ENCRYPTION_KEYS, pubsubTopic: env.GMAIL_PUBSUB_TOPIC ?? null, fcmServiceAccountJson: null },
    { logger: silentLogger, clock, fetchImpl, push },
  );
  const c: Container = { env, repos, auth, core, oauth, logger: silentLogger, limits: createLimits(), fetchImpl, now: () => clock.now() };
  setContainer(c);
  /** Maxwell にログインしている利用者を作り、その Cookie を返す（Gmail はまだつながっていない） */
  const signIn = (email = "me@example.com", id: string = crypto.randomUUID()) => {
    users.set(id, email);
    return { id, cookie: `${TEST_USER_COOKIE}=${id}` };
  };
  const signOut = (id: string) => users.delete(id);
  return { c, repos, gmail, push, clock, revoked, google, signIn, signOut };
}

/** ログイン済みで Gmail も接続済みの利用者を作り、ログイン Cookie を返す */
export async function connectUser(t: Awaited<ReturnType<typeof createTestContainer>>) {
  const { id: userId, cookie } = t.signIn("me@example.com");
  const user = await t.repos.users.ensure(userId, "me@example.com");
  const id = crypto.randomUUID();
  const account = await t.repos.accounts.upsertConnection({
    id,
    userId: user.id,
    provider: "gmail",
    email: "me@example.com",
    refreshTokenEnc: t.c.core.cipher.encrypt(t.gmail.refreshToken, tokenAad.refresh(id)),
    accessTokenEnc: t.c.core.cipher.encrypt("access-1", tokenAad.access(id)),
    accessTokenExpiresAt: new Date(t.clock.now().getTime() + 3600_000),
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  });
  return { user, account, cookie };
}

export function request(
  path: string,
  opts: { method?: string; cookie?: string; body?: unknown; origin?: string | null; headers?: Record<string, string> } = {},
) {
  const headers: Record<string, string> = { ...opts.headers };
  if (opts.cookie) headers.cookie = opts.cookie;
  if (opts.body !== undefined) headers["content-type"] = "application/json";
  if (opts.origin !== null && opts.method && opts.method !== "GET") headers.origin = opts.origin ?? ORIGIN;
  return new NextRequest(new URL(path, ORIGIN), {
    method: opts.method ?? "GET",
    headers,
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
  });
}

export const params = <P>(p: P) => ({ params: Promise.resolve(p) });
