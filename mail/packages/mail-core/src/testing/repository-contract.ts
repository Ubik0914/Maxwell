// リポジトリ実装の契約テスト。インメモリ実装と Postgres 実装の両方で同じ振る舞いを保証する。
import { describe, expect, it } from "vitest";
import type { Repositories } from "../server/wiring";

export function repositoryContract(name: string, make: () => Promise<Repositories>) {
  describe(`repository contract: ${name}`, () => {
    const connect = async (repos: Repositories, email = "owner@example.com") => {
      const user = await repos.users.upsertByEmail(email);
      const account = await repos.accounts.upsertConnection({
        userId: user.id,
        provider: "gmail",
        email,
        refreshTokenEnc: "enc-refresh",
        accessTokenEnc: "enc-access",
        accessTokenExpiresAt: new Date(Date.now() + 3600_000),
        scopes: ["s1"],
      });
      return { user, account };
    };

    it("users: upsert は同じメールで同じユーザーを返し、セッション版を上げられる", async () => {
      const repos = await make();
      const a = await repos.users.upsertByEmail("Owner@Example.com");
      const b = await repos.users.upsertByEmail("owner@example.com");
      expect(a.id).toBe(b.id);
      expect(a.email).toBe("owner@example.com");
      await repos.users.bumpSessionVersion(a.id);
      expect((await repos.users.findById(a.id))?.sessionVersion).toBe(a.sessionVersion + 1);
    });

    it("accounts: 再接続で状態が active に戻り、他ユーザーへは付け替えられない", async () => {
      const repos = await make();
      const { user, account } = await connect(repos);
      await repos.accounts.markReauthRequired(account.id, "invalid_grant");
      expect((await repos.accounts.findById(account.id))?.status).toBe("reauth_required");
      const again = await repos.accounts.upsertConnection({
        userId: user.id,
        provider: "gmail",
        email: "owner@example.com",
        refreshTokenEnc: "enc-2",
        accessTokenEnc: "enc-a2",
        accessTokenExpiresAt: new Date(),
        scopes: ["s1"],
      });
      expect(again.id).toBe(account.id);
      expect(again.status).toBe("active");
      expect(again.refreshTokenEnc).toBe("enc-2");

      const other = await repos.users.upsertByEmail("other@example.com");
      await expect(
        repos.accounts.upsertConnection({
          userId: other.id,
          provider: "gmail",
          email: "owner@example.com",
          refreshTokenEnc: "x",
          accessTokenEnc: "x",
          accessTokenExpiresAt: new Date(),
          scopes: [],
        }),
      ).rejects.toThrow();
      expect(await repos.accounts.listByUser(other.id)).toEqual([]);
    });

    it("accounts: history cursor は CAS でのみ進む", async () => {
      const repos = await make();
      const { account } = await connect(repos);
      expect(await repos.accounts.compareAndSetHistoryId(account.id, null, "100", new Date())).toBe(true);
      expect(await repos.accounts.compareAndSetHistoryId(account.id, null, "50", new Date())).toBe(false);
      expect(await repos.accounts.compareAndSetHistoryId(account.id, "100", "120", new Date())).toBe(true);
      expect((await repos.accounts.findById(account.id))?.historyId).toBe("120");
    });

    it("accounts: 同期リースは排他で、解放後は再取得できる", async () => {
      const repos = await make();
      const { account } = await connect(repos);
      expect(await repos.accounts.tryAcquireSyncLease(account.id, "a", 60_000)).toBe(true);
      expect(await repos.accounts.tryAcquireSyncLease(account.id, "b", 60_000)).toBe(false);
      await repos.accounts.releaseSyncLease(account.id, "b"); // 他人のリースは解放できない
      expect(await repos.accounts.tryAcquireSyncLease(account.id, "b", 60_000)).toBe(false);
      await repos.accounts.releaseSyncLease(account.id, "a");
      expect(await repos.accounts.tryAcquireSyncLease(account.id, "b", 60_000)).toBe(true);
    });

    it("accounts: watch 状態を記録できる", async () => {
      const repos = await make();
      const { account } = await connect(repos);
      const exp = new Date(Date.now() + 7 * 86400_000);
      await repos.accounts.updateWatch(account.id, { expiresAt: exp, renewedAt: new Date(), lastError: null });
      await repos.accounts.updateWatch(account.id, { lastError: "RATE_LIMITED" });
      const r = await repos.accounts.findById(account.id);
      expect(r?.watchExpiresAt?.getTime()).toBe(exp.getTime());
      expect(r?.watchLastError).toBe("RATE_LIMITED");
    });

    it("settings: 既定値はプレビュー非表示・通知ON", async () => {
      const repos = await make();
      const { user } = await connect(repos);
      expect(await repos.settings.get(user.id)).toEqual({ notificationsEnabled: true, notificationPreview: false });
      expect(await repos.settings.update(user.id, { notificationPreview: true })).toEqual({
        notificationsEnabled: true,
        notificationPreview: true,
      });
    });

    it("devices: 登録・無効化・本人のみ削除", async () => {
      const repos = await make();
      const { user } = await connect(repos);
      const other = await repos.users.upsertByEmail("other@example.com");
      await repos.devices.register(user.id, "tok-1", "android");
      await repos.devices.register(user.id, "tok-1", "android"); // 重複登録は1件
      await repos.devices.register(user.id, "tok-2", "android");
      expect((await repos.devices.listActive(user.id)).map((d) => d.token).sort()).toEqual(["tok-1", "tok-2"]);
      await repos.devices.disableToken("tok-2", "UNREGISTERED");
      await repos.devices.remove(other.id, "tok-1");
      expect((await repos.devices.listActive(user.id)).map((d) => d.token)).toEqual(["tok-1"]);
      await repos.devices.deleteAllForUser(user.id);
      expect(await repos.devices.listActive(user.id)).toEqual([]);
    });

    it("deliveries: claim は1回だけ成功し、失敗分は期限到来で再試行対象になる", async () => {
      const repos = await make();
      const { account } = await connect(repos);
      expect(await repos.deliveries.claim(account.id, "m1", "t1")).toBe(true);
      expect(await repos.deliveries.claim(account.id, "m1", "t1")).toBe(false);
      await repos.deliveries.markFailed(account.id, "m1", "fcm_retryable", new Date(Date.now() - 1000));
      const due = await repos.deliveries.listDue(new Date(), 10);
      expect(due).toHaveLength(1);
      expect(due[0]).toMatchObject({ messageId: "m1", threadId: "t1", attempts: 1 });
      await repos.deliveries.markSent(account.id, "m1");
      expect(await repos.deliveries.listDue(new Date(), 10)).toEqual([]);
    });

    it("sends: 同じ冪等キーは既存レコードを返す", async () => {
      const repos = await make();
      const { user } = await connect(repos);
      const key = "7f1b6a2e-1d5c-4c55-9a8e-2a1f0b3c4d5e";
      const first = await repos.sends.begin(user.id, key, "<a@x>");
      expect(first.created).toBe(true);
      const second = await repos.sends.begin(user.id, key, "<b@x>");
      expect(second.created).toBe(false);
      expect(second.record.rfc822MessageId).toBe("<a@x>");
      await repos.sends.finish(user.id, key, { status: "sent", messageId: "m", threadId: "t" });
      expect((await repos.sends.get(user.id, key))?.status).toBe("sent");
    });

    it("accounts: 削除で関連の配信記録も消せる", async () => {
      const repos = await make();
      const { account } = await connect(repos);
      await repos.deliveries.claim(account.id, "m1", "t1");
      await repos.deliveries.deleteForAccount(account.id);
      await repos.accounts.delete(account.id);
      expect(await repos.accounts.findById(account.id)).toBeNull();
      expect(await repos.deliveries.listDue(new Date(Date.now() + 86400_000), 10)).toEqual([]);
    });
  });
}
