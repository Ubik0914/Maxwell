// テスト用インメモリ実装。Postgres実装と同じ契約テスト（repository-contract.ts）を通す。
import { randomUUID } from "node:crypto";
import type { UserSettings } from "../types";
import type {
  AccountRecord,
  AccountRepository,
  ConnectAccountInput,
  DeliveryRecord,
  DeliveryRepository,
  DeliveryStatus,
  DeviceRecord,
  DeviceRepository,
  SendRecord,
  SendRepository,
  SettingsRepository,
  UserRecord,
  UserRepository,
} from "../server/ports";
import type { Repositories } from "../server/wiring";

export const DEFAULT_SETTINGS: UserSettings = { notificationsEnabled: true, notificationPreview: false };

export class MemoryUsers implements UserRepository {
  readonly rows = new Map<string, UserRecord>();
  async findById(id: string) {
    const u = this.rows.get(id);
    return u ? { ...u } : null;
  }
  async findByEmail(email: string) {
    const u = [...this.rows.values()].find((x) => x.email === email.toLowerCase());
    return u ? { ...u } : null;
  }
  async upsertByEmail(email: string) {
    const existing = await this.findByEmail(email);
    if (existing) return existing;
    const u = { id: randomUUID(), email: email.toLowerCase(), sessionVersion: 1 };
    this.rows.set(u.id, u);
    return { ...u };
  }
  async bumpSessionVersion(id: string) {
    const u = this.rows.get(id);
    if (u) u.sessionVersion++;
  }
}

interface AccountRow extends AccountRecord {
  leaseOwner: string | null;
  leaseUntil: number;
}

export class MemoryAccounts implements AccountRepository {
  readonly rows = new Map<string, AccountRow>();
  constructor(private readonly now: () => Date = () => new Date()) {}

  private pub(r: AccountRow | undefined): AccountRecord | null {
    if (!r) return null;
    const { leaseOwner: _o, leaseUntil: _u, ...rest } = r;
    return { ...rest, scopes: [...rest.scopes] };
  }
  async findById(id: string) {
    return this.pub(this.rows.get(id));
  }
  async listByUser(userId: string) {
    return [...this.rows.values()].filter((r) => r.userId === userId).map((r) => this.pub(r)!);
  }
  async findByProviderEmail(provider: string, email: string) {
    return this.pub([...this.rows.values()].find((r) => r.provider === provider && r.email === email.toLowerCase()));
  }
  async listActive() {
    return [...this.rows.values()].filter((r) => r.status === "active").map((r) => this.pub(r)!);
  }
  async upsertConnection(input: ConnectAccountInput) {
    const existing = [...this.rows.values()].find((r) => r.provider === input.provider && r.email === input.email.toLowerCase());
    if (existing && existing.userId !== input.userId) throw new Error("account_owned_by_other_user");
    const row: AccountRow = existing ?? {
      id: input.id ?? randomUUID(),
      userId: input.userId,
      provider: input.provider,
      email: input.email.toLowerCase(),
      refreshTokenEnc: "",
      accessTokenEnc: null,
      accessTokenExpiresAt: null,
      scopes: [],
      status: "active",
      statusReason: null,
      historyId: null,
      watchExpiresAt: null,
      watchRenewedAt: null,
      watchLastError: null,
      lastSyncedAt: null,
      leaseOwner: null,
      leaseUntil: 0,
    };
    Object.assign(row, {
      refreshTokenEnc: input.refreshTokenEnc,
      accessTokenEnc: input.accessTokenEnc,
      accessTokenExpiresAt: input.accessTokenExpiresAt,
      scopes: [...input.scopes],
      status: "active",
      statusReason: null,
    });
    this.rows.set(row.id, row);
    return this.pub(row)!;
  }
  async updateAccessToken(id: string, enc: string, expiresAt: Date) {
    const r = this.rows.get(id);
    if (r) Object.assign(r, { accessTokenEnc: enc, accessTokenExpiresAt: expiresAt });
  }
  async updateRefreshToken(id: string, enc: string) {
    const r = this.rows.get(id);
    if (r) r.refreshTokenEnc = enc;
  }
  async markReauthRequired(id: string, reason: string) {
    const r = this.rows.get(id);
    if (r) Object.assign(r, { status: "reauth_required", statusReason: reason, accessTokenEnc: null });
  }
  async compareAndSetHistoryId(id: string, expected: string | null, next: string, syncedAt: Date) {
    const r = this.rows.get(id);
    if (!r || r.historyId !== expected) return false;
    Object.assign(r, { historyId: next, lastSyncedAt: syncedAt });
    return true;
  }
  async updateWatch(id: string, patch: { expiresAt?: Date | null; renewedAt?: Date; lastError: string | null }) {
    const r = this.rows.get(id);
    if (!r) return;
    if (patch.expiresAt !== undefined) r.watchExpiresAt = patch.expiresAt;
    if (patch.renewedAt) r.watchRenewedAt = patch.renewedAt;
    r.watchLastError = patch.lastError;
  }
  async tryAcquireSyncLease(id: string, owner: string, ttlMs: number) {
    const r = this.rows.get(id);
    if (!r) return false;
    const t = this.now().getTime();
    if (r.leaseOwner && r.leaseUntil > t) return false;
    r.leaseOwner = owner;
    r.leaseUntil = t + ttlMs;
    return true;
  }
  async releaseSyncLease(id: string, owner: string) {
    const r = this.rows.get(id);
    if (r && r.leaseOwner === owner) {
      r.leaseOwner = null;
      r.leaseUntil = 0;
    }
  }
  async delete(id: string) {
    this.rows.delete(id);
  }
}

export class MemorySettings implements SettingsRepository {
  readonly rows = new Map<string, UserSettings>();
  async get(userId: string) {
    return { ...(this.rows.get(userId) ?? DEFAULT_SETTINGS) };
  }
  async update(userId: string, patch: Partial<UserSettings>) {
    const next = { ...(await this.get(userId)), ...patch };
    this.rows.set(userId, next);
    return { ...next };
  }
}

export class MemoryDevices implements DeviceRepository {
  readonly rows = new Map<string, DeviceRecord & { disabled: boolean }>();
  async listActive(userId: string) {
    return [...this.rows.values()]
      .filter((d) => d.userId === userId && !d.disabled)
      .map(({ disabled: _d, ...rest }) => rest);
  }
  async register(userId: string, token: string, platform: DeviceRecord["platform"]) {
    const existing = this.rows.get(token);
    this.rows.set(token, { id: existing?.id ?? randomUUID(), userId, token, platform, disabled: false });
  }
  async remove(userId: string, token: string) {
    const d = this.rows.get(token);
    if (d && d.userId === userId) this.rows.delete(token);
  }
  async disableToken(token: string) {
    const d = this.rows.get(token);
    if (d) d.disabled = true;
  }
  async deleteAllForUser(userId: string) {
    for (const [k, d] of this.rows) if (d.userId === userId) this.rows.delete(k);
  }
}

export class MemoryDeliveries implements DeliveryRepository {
  readonly rows = new Map<string, DeliveryRecord & { reason: string | null; createdAt: Date }>();
  constructor(private readonly now: () => Date = () => new Date()) {}
  private key(a: string, m: string) {
    return `${a}:${m}`;
  }
  private set(a: string, m: string, status: DeliveryStatus, extra: Partial<DeliveryRecord> & { reason?: string | null }) {
    const r = this.rows.get(this.key(a, m));
    if (r) Object.assign(r, { status, ...extra });
  }
  async claim(accountId: string, messageId: string, threadId: string) {
    const k = this.key(accountId, messageId);
    if (this.rows.has(k)) return false;
    this.rows.set(k, {
      accountId,
      messageId,
      threadId,
      status: "pending",
      attempts: 0,
      nextAttemptAt: null,
      reason: null,
      createdAt: this.now(),
    });
    return true;
  }
  async markSent(a: string, m: string) {
    this.set(a, m, "sent", { nextAttemptAt: null });
  }
  async markSkipped(a: string, m: string, reason: string) {
    this.set(a, m, "skipped", { reason, nextAttemptAt: null });
  }
  async markFailed(a: string, m: string, errorCode: string, nextAttemptAt: Date | null) {
    const r = this.rows.get(this.key(a, m));
    if (r) Object.assign(r, { status: "failed", reason: errorCode, nextAttemptAt, attempts: r.attempts + 1 });
  }
  async listDue(now: Date, limit: number) {
    return [...this.rows.values()]
      .filter((r) => r.status === "failed" && r.nextAttemptAt && r.nextAttemptAt <= now)
      .slice(0, limit)
      .map(({ reason: _r, createdAt: _c, ...rest }) => rest);
  }
  async deleteForAccount(accountId: string) {
    for (const [k, r] of this.rows) if (r.accountId === accountId) this.rows.delete(k);
  }
  async purgeOlderThan(date: Date) {
    let n = 0;
    for (const [k, r] of this.rows) {
      if (r.createdAt < date && r.status !== "failed") {
        this.rows.delete(k);
        n++;
      }
    }
    return n;
  }
}

export class MemorySends implements SendRepository {
  readonly rows = new Map<string, SendRecord>();
  async begin(userId: string, key: string, rfc822MessageId: string) {
    const k = `${userId}:${key}`;
    const existing = this.rows.get(k);
    if (existing) return { created: false, record: { ...existing } };
    const record: SendRecord = {
      userId,
      idempotencyKey: key,
      status: "pending",
      rfc822MessageId,
      messageId: null,
      threadId: null,
      errorCode: null,
    };
    this.rows.set(k, record);
    return { created: true, record: { ...record } };
  }
  async finish(userId: string, key: string, patch: Parameters<SendRepository["finish"]>[2]) {
    const r = this.rows.get(`${userId}:${key}`);
    if (r) Object.assign(r, { messageId: null, threadId: null, errorCode: null, ...patch });
  }
  async get(userId: string, key: string) {
    const r = this.rows.get(`${userId}:${key}`);
    return r ? { ...r } : null;
  }
}

export function createMemoryRepositories(now: () => Date = () => new Date()): Repositories & {
  users: MemoryUsers;
  accounts: MemoryAccounts;
  settings: MemorySettings;
  devices: MemoryDevices;
  deliveries: MemoryDeliveries;
  sends: MemorySends;
} {
  return {
    users: new MemoryUsers(),
    accounts: new MemoryAccounts(now),
    settings: new MemorySettings(),
    devices: new MemoryDevices(),
    deliveries: new MemoryDeliveries(now),
    sends: new MemorySends(),
  };
}
