// Gmail history cursor による増分同期（仕様4章 SyncService / 6章）。
// Pub/Subイベントは「同期のきっかけ」として扱い、イベントの内容（historyId）を信用しすぎない。
// - カーソルは処理成功後にだけ進める（CAS）
// - 重複・順序逆転・遅延したイベントは冪等に処理される
// - カーソル期限切れは本文をコピーせず、最近の未読だけを照合して再同期する
import { randomUUID } from "node:crypto";
import { MailError } from "../errors";
import type { Logger } from "./logger";
import type { NotificationService } from "./notification-service";
import type { AccountRecord, AccountRepository, Clock } from "./ports";
import type { ChangedMessage, ProviderFactory } from "./provider";

export type SyncOutcome = "initialized" | "synced" | "resynced" | "noop" | "busy" | "ignored" | "reauth_required";

export interface SyncResult {
  outcome: SyncOutcome;
  newMessages: number;
  notified: number;
}

export interface SyncServiceDeps {
  accounts: AccountRepository;
  providerFactory: ProviderFactory;
  notifications: NotificationService;
  clock: Clock;
  logger: Logger;
  /** Pub/Subトピック名 projects/<project>/topics/<topic>。未設定なら watch しない */
  pubsubTopic: string | null;
  leaseTtlMs?: number;
}

const RESYNC_LOOKBACK_MS = 24 * 60 * 60 * 1000;
const RESYNC_LIMIT = 20;

export function compareHistoryId(a: string, b: string): number {
  const x = BigInt(a);
  const y = BigInt(b);
  return x < y ? -1 : x > y ? 1 : 0;
}

export class SyncService {
  constructor(private readonly deps: SyncServiceDeps) {}

  /** Pub/Sub 通知（emailAddress, historyId）の処理 */
  async handlePushEvent(event: { emailAddress: string; historyId: string }): Promise<SyncResult> {
    const account = await this.deps.accounts.findByProviderEmail("gmail", event.emailAddress.toLowerCase());
    if (!account) {
      this.deps.logger.info("sync.push_unknown_account");
      return { outcome: "ignored", newMessages: 0, notified: 0 };
    }
    if (account.status !== "active") return { outcome: "reauth_required", newMessages: 0, notified: 0 };
    // 既に処理済みの位置より古い（遅延・重複）イベントは何もしない
    if (account.historyId && /^\d+$/.test(event.historyId) && compareHistoryId(event.historyId, account.historyId) <= 0) {
      return { outcome: "noop", newMessages: 0, notified: 0 };
    }
    return this.syncAccount(account.id, "push");
  }

  async syncAccount(accountId: string, reason: "push" | "reconcile" | "manual" | "connect"): Promise<SyncResult> {
    const { accounts, logger } = this.deps;
    const owner = randomUUID();
    const log = logger.child({ accountId, reason, correlationId: owner });
    if (!(await accounts.tryAcquireSyncLease(accountId, owner, this.deps.leaseTtlMs ?? 120_000))) {
      log.info("sync.busy");
      return { outcome: "busy", newMessages: 0, notified: 0 };
    }
    try {
      const account = await accounts.findById(accountId);
      if (!account) return { outcome: "ignored", newMessages: 0, notified: 0 };
      if (account.status !== "active") return { outcome: "reauth_required", newMessages: 0, notified: 0 };
      const result = await this.syncLocked(account, log);
      log.info("sync.done", { outcome: result.outcome, newMessages: result.newMessages, notified: result.notified });
      return result;
    } catch (e) {
      if (e instanceof MailError && e.code === "REAUTH_REQUIRED") {
        log.warn("sync.reauth_required");
        return { outcome: "reauth_required", newMessages: 0, notified: 0 };
      }
      log.error("sync.failed", { errorCode: e instanceof MailError ? e.code : "INTERNAL", error: e });
      throw e;
    } finally {
      await accounts.releaseSyncLease(accountId, owner);
    }
  }

  private async syncLocked(account: AccountRecord, log: Logger): Promise<SyncResult> {
    const { accounts, providerFactory, notifications, clock } = this.deps;
    const feed = providerFactory(account);

    if (!account.historyId) {
      // 初回：現在位置を起点にする（過去メールは通知しない）
      const profile = await feed.getProfile();
      await accounts.compareAndSetHistoryId(account.id, null, profile.historyId, clock.now());
      return { outcome: "initialized", newMessages: 0, notified: 0 };
    }

    let messages: ChangedMessage[];
    let nextCursor: string;
    let outcome: SyncOutcome = "synced";
    try {
      const r = await feed.listAddedSince(account.historyId);
      messages = r.messages;
      nextCursor = r.historyId;
    } catch (e) {
      if (!(e instanceof MailError && e.code === "CURSOR_EXPIRED")) throw e;
      log.warn("sync.cursor_expired");
      // 先に現在位置を取ってから照合し、その間の新着を取りこぼさない
      const profile = await feed.getProfile();
      const since = account.lastSyncedAt
        ? new Date(Math.max(account.lastSyncedAt.getTime() - 5 * 60_000, clock.now().getTime() - RESYNC_LOOKBACK_MS))
        : new Date(clock.now().getTime() - 60 * 60_000);
      messages = await feed.listRecentInbox(since, RESYNC_LIMIT);
      nextCursor = profile.historyId;
      outcome = "resynced";
    }

    const { notified } = messages.length
      ? await notifications.processNewMessages(account, messages)
      : { notified: 0 };

    // 通知の失敗は配信テーブルに残り再試行されるため、ここでカーソルを進めてよい
    if (compareHistoryId(nextCursor, account.historyId) > 0 || outcome === "resynced") {
      const ok = await accounts.compareAndSetHistoryId(account.id, account.historyId, nextCursor, clock.now());
      if (!ok) log.info("sync.cursor_cas_conflict");
    }
    return { outcome, newMessages: messages.length, notified };
  }

  /** 接続直後の初期化：カーソル設定と watch 開始 */
  async initializeAccount(accountId: string): Promise<void> {
    await this.syncAccount(accountId, "connect");
    await this.renewWatch(accountId);
  }

  async renewWatch(accountId: string): Promise<{ ok: boolean; expiresAt: Date | null }> {
    const { accounts, providerFactory, clock, logger, pubsubTopic } = this.deps;
    if (!pubsubTopic) {
      logger.warn("watch.topic_not_configured");
      return { ok: false, expiresAt: null };
    }
    const account = await accounts.findById(accountId);
    if (!account || account.status !== "active") return { ok: false, expiresAt: null };
    try {
      const r = await providerFactory(account).watch(pubsubTopic);
      await accounts.updateWatch(account.id, { expiresAt: r.expiresAt, renewedAt: clock.now(), lastError: null });
      logger.info("watch.renewed", { accountId, expiresAt: r.expiresAt.toISOString() });
      return { ok: true, expiresAt: r.expiresAt };
    } catch (e) {
      const code = e instanceof MailError ? `${e.code}${e.detail ? `:${e.detail}` : ""}` : "INTERNAL";
      await accounts.updateWatch(account.id, { lastError: code.slice(0, 200) });
      logger.error("watch.renew_failed", { accountId, errorCode: code });
      return { ok: false, expiresAt: account.watchExpiresAt };
    }
  }

  /** 毎日実行（Googleの推奨）：全アカウントの watch を更新する。watch は約7日で切れるため、失敗しても期限前に数回再試行できる */
  async renewAllWatches(): Promise<{ renewed: number; failed: number }> {
    const list = await this.deps.accounts.listActive();
    let renewed = 0;
    let failed = 0;
    for (const a of list) {
      const r = await this.renewWatch(a.id);
      if (r.ok) renewed++;
      else failed++;
    }
    return { renewed, failed };
  }

  /** 定期照合：push の取りこぼしを補完し、失敗した通知を再試行する */
  async reconcileAll(): Promise<{ accounts: number; failed: number; retriedNotifications: number }> {
    const list = await this.deps.accounts.listActive();
    let failed = 0;
    for (const a of list) {
      try {
        await this.syncAccount(a.id, "reconcile");
      } catch {
        failed++;
      }
    }
    const retriedNotifications = await this.deps.notifications.retryDue();
    return { accounts: list.length, failed, retriedNotifications };
  }
}
