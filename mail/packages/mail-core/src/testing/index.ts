// テスト用ユーティリティ（本番コードから import しない）
import { randomBytes } from "node:crypto";
import { silentLogger, type Logger } from "../server/logger";
import type { Clock, PushMessage, PushResult, PushSender } from "../server/ports";
import { tokenAad } from "../server/token-manager";
import { createCoreServices } from "../server/wiring";
import { FakeGmail } from "./fake-gmail";
import { createMemoryRepositories } from "./memory-repos";

export * from "./fake-gmail";
export * from "./memory-repos";
export * from "./repository-contract";

export class FakeClock implements Clock {
  constructor(public current = new Date("2026-10-10T00:00:00Z")) {}
  now() {
    return new Date(this.current);
  }
  async sleep(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
  advance(ms: number) {
    this.current = new Date(this.current.getTime() + ms);
  }
}

export class RecordingPushSender implements PushSender {
  readonly sent: { token: string; message: PushMessage }[] = [];
  /** 次に返す結果（キュー）。空なら成功 */
  readonly queue: PushResult[] = [];
  async send(token: string, message: PushMessage): Promise<PushResult> {
    const r = this.queue.shift() ?? { ok: true };
    if (r.ok) this.sent.push({ token, message });
    return r;
  }
}

export function testEncryptionKeys(): string {
  return `t1:${randomBytes(32).toString("base64")}`;
}

export interface HarnessOptions {
  logger?: Logger;
  pubsubTopic?: string | null;
}

/** 接続済みユーザー1人・Gmail 1アカウントのテスト環境を作る */
export async function createHarness(opts: HarnessOptions = {}) {
  const clock = new FakeClock(new Date());
  const repos = createMemoryRepositories(() => clock.now());
  const gmail = new FakeGmail("me@example.com");
  const push = new RecordingPushSender();
  const core = createCoreServices(
    repos,
    {
      oauth: { clientId: "client-id", clientSecret: "client-secret", redirectUri: "https://app.example.com/api/auth/google/callback" },
      tokenEncryptionKeys: testEncryptionKeys(),
      pubsubTopic: opts.pubsubTopic === undefined ? "projects/p/topics/gmail" : opts.pubsubTopic,
      fcmServiceAccountJson: null,
    },
    { logger: opts.logger ?? silentLogger, clock, fetchImpl: gmail.fetch, push },
  );
  const user = await repos.users.upsertByEmail("me@example.com");
  let account = await repos.accounts.upsertConnection({
    userId: user.id,
    provider: "gmail",
    email: "me@example.com",
    refreshTokenEnc: "placeholder",
    accessTokenEnc: "placeholder",
    accessTokenExpiresAt: new Date(clock.now().getTime() + 3600_000),
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  });
  // 実際の暗号文（AADにアカウントIDを含む）で保存し直す
  account = await repos.accounts.upsertConnection({
    userId: user.id,
    provider: "gmail",
    email: "me@example.com",
    refreshTokenEnc: core.cipher.encrypt(gmail.refreshToken, tokenAad.refresh(account.id)),
    accessTokenEnc: core.cipher.encrypt("access-1", tokenAad.access(account.id)),
    accessTokenExpiresAt: new Date(clock.now().getTime() + 3600_000),
    scopes: ["https://www.googleapis.com/auth/gmail.modify"],
  });
  await repos.devices.register(user.id, "device-token-1", "android");
  return { clock, repos, gmail, push, core, user, account, ctx: { userId: user.id } };
}
