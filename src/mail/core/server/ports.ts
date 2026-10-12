// 永続化・外部送信の境界（ポート）。実装は @/mail/database（Postgres／インメモリ）と fcm.ts にある。
import type { AccountStatus, ProviderId, SendStatus, UserSettings } from "../types";

/** 利用者。id は Maxwell（Supabase Auth）のユーザーID。ログイン・セッションは Supabase が持つ */
export interface UserRecord {
  id: string;
  email: string;
}

export interface AccountRecord {
  id: string;
  userId: string;
  provider: ProviderId;
  email: string;
  refreshTokenEnc: string;
  accessTokenEnc: string | null;
  accessTokenExpiresAt: Date | null;
  scopes: string[];
  status: AccountStatus;
  statusReason: string | null;
  historyId: string | null;
  watchExpiresAt: Date | null;
  watchRenewedAt: Date | null;
  watchLastError: string | null;
  lastSyncedAt: Date | null;
}

export interface ConnectAccountInput {
  /** 新規作成時に使うID（トークン暗号化のAADにIDを含めるため、呼び出し側で先に決める） */
  id?: string;
  userId: string;
  provider: ProviderId;
  email: string;
  refreshTokenEnc: string;
  accessTokenEnc: string;
  accessTokenExpiresAt: Date;
  scopes: string[];
}

export interface UserRepository {
  findById(id: string): Promise<UserRecord | null>;
  /** Supabase のユーザーを mail.users に用意する（なければ作り、メールアドレスは最新に揃える） */
  ensure(id: string, email: string): Promise<UserRecord>;
}

export interface AccountRepository {
  findById(id: string): Promise<AccountRecord | null>;
  listByUser(userId: string): Promise<AccountRecord[]>;
  findByProviderEmail(provider: ProviderId, email: string): Promise<AccountRecord | null>;
  listActive(): Promise<AccountRecord[]>;
  /** 接続・再接続。既存の同一アドレスがあればトークンを差し替え、状態を active に戻す */
  upsertConnection(input: ConnectAccountInput): Promise<AccountRecord>;
  updateAccessToken(id: string, accessTokenEnc: string, expiresAt: Date): Promise<void>;
  /** refresh token をローテーションした場合のみ使う */
  updateRefreshToken(id: string, refreshTokenEnc: string): Promise<void>;
  markReauthRequired(id: string, reason: string): Promise<void>;
  /**
   * 同期カーソルの比較更新（CAS）。expected と一致する場合だけ next に進める。
   * 複数イベントの並行処理で古いカーソルに巻き戻さないため。
   */
  compareAndSetHistoryId(id: string, expected: string | null, next: string, syncedAt: Date): Promise<boolean>;
  updateWatch(id: string, patch: { expiresAt?: Date | null; renewedAt?: Date; lastError: string | null }): Promise<void>;
  /** 同期の排他（リース）。期限切れのリースは奪える */
  tryAcquireSyncLease(id: string, owner: string, ttlMs: number): Promise<boolean>;
  releaseSyncLease(id: string, owner: string): Promise<void>;
  delete(id: string): Promise<void>;
}

export interface SettingsRepository {
  get(userId: string): Promise<UserSettings>;
  update(userId: string, patch: Partial<UserSettings>): Promise<UserSettings>;
}

export interface DeviceRecord {
  id: string;
  userId: string;
  token: string;
  platform: "android" | "web";
}

export interface DeviceRepository {
  listActive(userId: string): Promise<DeviceRecord[]>;
  register(userId: string, token: string, platform: DeviceRecord["platform"]): Promise<void>;
  remove(userId: string, token: string): Promise<void>;
  /** FCMが無効と返したトークンを除外する */
  disableToken(token: string, reason: string): Promise<void>;
  deleteAllForUser(userId: string): Promise<void>;
}

export type DeliveryStatus = "pending" | "sent" | "skipped" | "failed";

export interface DeliveryRecord {
  accountId: string;
  messageId: string;
  threadId: string;
  status: DeliveryStatus;
  attempts: number;
  nextAttemptAt: Date | null;
}

export interface DeliveryRepository {
  /** 通知重複排除キー（accountId, messageId）を確保する。既に存在すれば false */
  claim(accountId: string, messageId: string, threadId: string): Promise<boolean>;
  markSent(accountId: string, messageId: string): Promise<void>;
  markSkipped(accountId: string, messageId: string, reason: string): Promise<void>;
  markFailed(accountId: string, messageId: string, errorCode: string, nextAttemptAt: Date | null): Promise<void>;
  listDue(now: Date, limit: number): Promise<DeliveryRecord[]>;
  deleteForAccount(accountId: string): Promise<void>;
  /** 古い重複排除キーの掃除 */
  purgeOlderThan(date: Date): Promise<number>;
}

export interface SendRecord {
  userId: string;
  idempotencyKey: string;
  status: SendStatus;
  rfc822MessageId: string;
  messageId: string | null;
  threadId: string | null;
  errorCode: string | null;
}

export interface SendRepository {
  /** 送信開始を記録する。既に同じキーがあれば既存レコードを返す */
  begin(userId: string, key: string, rfc822MessageId: string): Promise<{ created: boolean; record: SendRecord }>;
  finish(
    userId: string,
    key: string,
    patch: { status: Exclude<SendStatus, "pending">; messageId?: string | null; threadId?: string | null; errorCode?: string | null },
  ): Promise<void>;
  get(userId: string, key: string): Promise<SendRecord | null>;
}

export interface PushMessage {
  title: string;
  body: string;
  data: Record<string, string>;
  /** Android の通知グループ・置換に使う */
  tag?: string;
}

export type PushResult = { ok: true } | { ok: false; kind: "invalid_token" | "retryable" | "fatal"; errorCode: string };

export interface PushSender {
  send(token: string, message: PushMessage): Promise<PushResult>;
}

export interface Clock {
  now(): Date;
  sleep(ms: number): Promise<void>;
}

export const systemClock: Clock = {
  now: () => new Date(),
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
};
