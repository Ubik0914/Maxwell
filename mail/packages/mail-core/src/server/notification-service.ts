// 同期結果から通知対象を判定しFCMへ送る（仕様4章 NotificationService / 6章）。
// 重複排除キーを先に確保してから送るため、同じメッセージの通知は1回だけになる。
import { displayName, parseAddress } from "../address";
import { backoffDelay } from "./backoff";
import type { Logger } from "./logger";
import type { MailboxChangeFeed } from "./provider";
import type {
  AccountRecord,
  AccountRepository,
  Clock,
  DeliveryRepository,
  DeviceRepository,
  PushMessage,
  PushSender,
  SettingsRepository,
} from "./ports";
import type { ChangedMessage, ProviderFactory } from "./provider";

export const NOTIFICATION_CHANNEL_ID = "new_mail";
/** 一度の同期でこれを超える新着は1件のまとめ通知にする（再同期時の大量通知を防ぐ） */
export const BURST_THRESHOLD = 3;
const IN_PROCESS_ATTEMPTS = 3;
const MAX_TOTAL_ATTEMPTS = 8;

export interface NotificationServiceDeps {
  accounts: AccountRepository;
  settings: SettingsRepository;
  devices: DeviceRepository;
  deliveries: DeliveryRepository;
  push: PushSender;
  providerFactory: ProviderFactory;
  clock: Clock;
  logger: Logger;
  /** テスト用にバックオフ基準を小さくできる */
  backoffBaseMs?: number;
}

type SendOutcome = "sent" | "no_devices" | "retryable" | "fatal";

export class NotificationService {
  constructor(private readonly deps: NotificationServiceDeps) {}

  async processNewMessages(account: AccountRecord, messages: ChangedMessage[]): Promise<{ notified: number; skipped: number }> {
    const { deliveries, settings, logger } = this.deps;
    const log = logger.child({ accountId: account.id });
    const claimed: ChangedMessage[] = [];
    for (const m of messages) {
      if (await deliveries.claim(account.id, m.messageId, m.threadId)) claimed.push(m);
    }
    if (claimed.length === 0) return { notified: 0, skipped: 0 };

    const prefs = await settings.get(account.userId);
    if (!prefs.notificationsEnabled) {
      for (const m of claimed) await deliveries.markSkipped(account.id, m.messageId, "disabled");
      log.info("notify.skipped_disabled", { count: claimed.length });
      return { notified: 0, skipped: claimed.length };
    }

    if (claimed.length > BURST_THRESHOLD) {
      const outcome = await this.sendToDevices(account.userId, {
        title: "Synedge",
        body: `${claimed.length}件の新着メールがあります`,
        data: { kind: "new_mail_batch", accountId: account.id },
        tag: `batch-${account.id}`,
      });
      for (const m of claimed) await this.record(account.id, m.messageId, outcome, 0);
      log.info("notify.batch", { count: claimed.length, outcome });
      return outcome === "sent" ? { notified: claimed.length, skipped: 0 } : { notified: 0, skipped: claimed.length };
    }

    let notified = 0;
    for (const m of claimed) {
      const message = await this.buildMessage(account, m.messageId, m.threadId, prefs.notificationPreview);
      const outcome = await this.sendToDevices(account.userId, message);
      await this.record(account.id, m.messageId, outcome, 0);
      if (outcome === "sent") notified++;
    }
    log.info("notify.processed", { count: claimed.length, notified });
    return { notified, skipped: claimed.length - notified };
  }

  /** 失敗した配信の再試行（定期照合ジョブから呼ぶ） */
  async retryDue(limit = 50): Promise<number> {
    const { deliveries, accounts, settings, clock } = this.deps;
    const due = await deliveries.listDue(clock.now(), limit);
    let sent = 0;
    for (const d of due) {
      const account = await accounts.findById(d.accountId);
      if (!account || account.status !== "active") {
        await deliveries.markSkipped(d.accountId, d.messageId, "account_inactive");
        continue;
      }
      const prefs = await settings.get(account.userId);
      if (!prefs.notificationsEnabled) {
        await deliveries.markSkipped(d.accountId, d.messageId, "disabled");
        continue;
      }
      const message = await this.buildMessage(account, d.messageId, d.threadId, prefs.notificationPreview);
      const outcome = await this.sendToDevices(account.userId, message);
      await this.record(d.accountId, d.messageId, outcome, d.attempts);
      if (outcome === "sent") sent++;
    }
    return sent;
  }

  /** 実証ゲート用のテスト通知（UIの設定画面から本人が実行） */
  async sendTest(userId: string): Promise<SendOutcome> {
    return this.sendToDevices(userId, {
      title: "Synedge テスト通知",
      body: "この通知が見えていれば、プッシュ通知の経路は動作しています。",
      data: { kind: "test" },
      tag: "test",
    });
  }

  async buildMessage(account: AccountRecord, messageId: string, threadId: string, preview: boolean): Promise<PushMessage> {
    const data = { kind: "new_mail", accountId: account.id, threadId };
    if (!preview) {
      // プレビュー非表示：件名・本文・送信者を含めない（仕様6章）
      return { title: "Synedge", body: "新しいメールがあります", data, tag: threadId };
    }
    try {
      const feed: MailboxChangeFeed = this.deps.providerFactory(account);
      const meta = await feed.getMessageMeta(messageId);
      const from = meta.from ? parseAddress(meta.from) : null;
      return {
        title: truncate(displayName(from), 60),
        body: truncate(meta.subject || "(件名なし)", 120),
        data,
        tag: threadId,
      };
    } catch (e) {
      // メタデータが取れなくても通知自体は届ける
      this.deps.logger.warn("notify.meta_failed", { accountId: account.id, error: e });
      return { title: "Synedge", body: "新しいメールがあります", data, tag: threadId };
    }
  }

  private async sendToDevices(userId: string, message: PushMessage): Promise<SendOutcome> {
    const { devices, push, clock, logger } = this.deps;
    const list = await devices.listActive(userId);
    if (list.length === 0) return "no_devices";

    let anySent = false;
    let anyRetryable = false;
    for (const device of list) {
      for (let attempt = 0; attempt < IN_PROCESS_ATTEMPTS; attempt++) {
        const r = await push.send(device.token, message);
        if (r.ok) {
          anySent = true;
          break;
        }
        if (r.kind === "invalid_token") {
          await devices.disableToken(device.token, r.errorCode);
          logger.info("notify.token_disabled", { userId, errorCode: r.errorCode });
          break;
        }
        if (r.kind === "fatal") {
          logger.error("notify.fcm_fatal", { userId, errorCode: r.errorCode });
          break;
        }
        logger.warn("notify.fcm_retryable", { userId, errorCode: r.errorCode, attempt });
        if (attempt === IN_PROCESS_ATTEMPTS - 1) anyRetryable = true;
        else await clock.sleep(backoffDelay(attempt, this.deps.backoffBaseMs ?? 500, 5_000));
      }
    }
    if (anySent) return "sent";
    return anyRetryable ? "retryable" : "fatal";
  }

  private async record(accountId: string, messageId: string, outcome: SendOutcome, previousAttempts: number) {
    const { deliveries, clock } = this.deps;
    if (outcome === "sent") return deliveries.markSent(accountId, messageId);
    if (outcome === "no_devices") return deliveries.markSkipped(accountId, messageId, "no_devices");
    const attempts = previousAttempts + 1;
    const next =
      outcome === "retryable" && attempts < MAX_TOTAL_ATTEMPTS
        ? new Date(clock.now().getTime() + backoffDelay(attempts, 60_000, 60 * 60_000))
        : null;
    return deliveries.markFailed(accountId, messageId, outcome === "retryable" ? "fcm_retryable" : "fcm_fatal", next);
  }
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n - 1) + "…" : s;
}
