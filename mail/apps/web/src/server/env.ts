import "server-only";
import { z } from "zod";

// 実行時に読む（ビルド時に秘密情報を必要としない）
const schema = z.object({
  APP_ORIGIN: z.string().url(),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET は32文字以上にしてください"),
  ALLOWED_EMAILS: z
    .string()
    .min(3, "ALLOWED_EMAILS（ログインを許可するGoogleアカウント）が必要です")
    .transform((s) =>
      s
        .split(",")
        .map((e) => e.trim().toLowerCase())
        .filter(Boolean),
    ),
  GOOGLE_CLIENT_ID: z.string().min(1),
  GOOGLE_CLIENT_SECRET: z.string().min(1),
  TOKEN_ENCRYPTION_KEYS: z.string().min(1),
  DATABASE_URL: z.string().min(1),
  GMAIL_PUBSUB_TOPIC: z
    .string()
    .regex(/^projects\/[^/]+\/topics\/[^/]+$/)
    .optional()
    .or(z.literal("").transform(() => undefined)),
  FCM_SERVICE_ACCOUNT_JSON: z.string().optional(),
  ANDROID_APP_SCHEME: z.string().regex(/^[a-z][a-z0-9+.-]*$/).default("synedge"),
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
