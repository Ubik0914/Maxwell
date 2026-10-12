import "server-only";
import { z } from "zod";

const list = z
  .string()
  .optional()
  .transform((s) => (s ?? "").split(",").map((x) => x.trim()).filter(Boolean));
const optionalUrl = z.string().url().optional().or(z.literal("").transform(() => undefined));

// 実行時に読む（ビルド時に秘密情報を必要としない）。メールを使うときだけ必要で、
// 未設定でも蔵書など Maxwell の他の画面は動く（メールの画面・APIだけがエラーを返す）。
const schema = z.object({
  APP_ORIGIN: z.string().url(),
  MAIL_OAUTH_SECRET: z.string().min(32, "MAIL_OAUTH_SECRET は32文字以上にしてください"),
  MAIL_ALLOWED_EMAILS: z
    .string()
    .min(3, "MAIL_ALLOWED_EMAILS（接続を許可する Gmail アカウント）が必要です")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  MAIL_TOKEN_ENCRYPTION_KEYS: z.string().min(1),
  MAIL_DATABASE_URL: z.string().min(1),
  GMAIL_PUBSUB_TOPIC: z
    .string()
    .regex(/^projects\/[^/]+\/topics\/[^/]+$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  ANDROID_APP_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/).default("synedge"),
  // 新着通知（Pub/Sub push）の OIDC 検証。audience は push エンドポイントの URL
  PUBSUB_AUDIENCE: optionalUrl,
  PUBSUB_SERVICE_ACCOUNTS: list,
  // 定期ジョブ：Vercel Cron（CRON_SECRET）と Cloud Scheduler（OIDC）のどちらでも呼べる
  CRON_SECRET: z.string().min(16).optional().or(z.literal("").transform(() => undefined)),
  SCHEDULER_AUDIENCE: optionalUrl,
  SCHEDULER_SERVICE_ACCOUNTS: list,
});

export type Env = z.infer<typeof schema>;

let cached: Env | null = null;

export function getEnv(): Env {
  if (cached) return cached;
  const r = schema.safeParse(process.env);
  if (!r.success) {
    const keys = r.error.issues.map((i) => i.path.join(".")).join(", ");
    throw new Error(`環境変数が不足または不正です: ${keys}`);
  }
  cached = r.data;
  return cached;
}

export function isSecureOrigin(env: Env): boolean {
  return env.APP_ORIGIN.startsWith("https://");
}
