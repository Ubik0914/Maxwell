import { describe, expect, it } from "vitest";
import { createHarness } from "../testing";
import { BURST_THRESHOLD } from "./notification-service";

async function connected() {
  const h = await createHarness();
  await h.core.sync.initializeAccount(h.account.id);
  return h;
}

describe("SyncService：Gmail history 同期", () => {
  it("初回はカーソルを現在位置に合わせ、過去メールを通知しない。watch を開始する", async () => {
    const h = await createHarness();
    h.gmail.addMessage({ from: "old@example.com", subject: "old", text: "x" });
    await h.core.sync.initializeAccount(h.account.id);
    const acc = (await h.repos.accounts.findById(h.account.id))!;
    expect(acc.historyId).toBe(String(h.gmail.historyId));
    expect(acc.watchExpiresAt).not.toBeNull();
    expect(h.gmail.watchCalls).toBe(1);
    expect(h.push.sent).toHaveLength(0);
  });

  it("新着メールで通知し、カーソルを進める", async () => {
    const h = await connected();
    const m = h.gmail.deliver({ from: "Taro <t@example.com>", subject: "新着", text: "x" });
    const r = await h.core.sync.handlePushEvent({ emailAddress: "me@example.com", historyId: String(h.gmail.historyId) });
    expect(r).toMatchObject({ outcome: "synced", newMessages: 1, notified: 1 });
    expect(h.push.sent).toHaveLength(1);
    expect(h.push.sent[0]!.message.data).toMatchObject({ kind: "new_mail", threadId: m.threadId });
    expect((await h.repos.accounts.findById(h.account.id))!.historyId).toBe(String(h.gmail.historyId));
  });

  it("イベント重複・順序逆転・遅延：同じメールは1回だけ通知する", async () => {
    const h = await connected();
    h.gmail.deliver({ from: "a@example.com", subject: "1", text: "x" });
    const e1 = String(h.gmail.historyId);
    h.gmail.deliver({ from: "a@example.com", subject: "2", text: "x" });
    const e2 = String(h.gmail.historyId);
    await h.core.sync.handlePushEvent({ emailAddress: "me@example.com", historyId: e2 });
    // 古いイベントが遅れて届く・同じイベントが再送される
    expect((await h.core.sync.handlePushEvent({ emailAddress: "me@example.com", historyId: e1 })).outcome).toBe("noop");
    expect((await h.core.sync.handlePushEvent({ emailAddress: "ME@example.com", historyId: e2 })).outcome).toBe("noop");
    await h.core.sync.syncAccount(h.account.id, "reconcile");
    expect(h.push.sent).toHaveLength(2);
  });

  it("送信済み・既読・下書きは通知しない", async () => {
    const h = await connected();
    h.gmail.deliver({ from: "me@example.com", subject: "sent", text: "x", labelIds: ["SENT", "INBOX", "UNREAD"] });
    h.gmail.deliver({ from: "a@example.com", subject: "read", text: "x", labelIds: ["INBOX"] });
    await h.core.sync.syncAccount(h.account.id, "manual");
    expect(h.push.sent).toHaveLength(0);
  });

  it("途中失敗（Gmail 5xx）ではカーソルを進めず、次回の同期で取りこぼさない", async () => {
    const h = await connected();
    const before = (await h.repos.accounts.findById(h.account.id))!.historyId;
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    h.gmail.failNext({ match: /^\/history$/, status: 500, times: 4 });
    await expect(h.core.sync.syncAccount(h.account.id, "push")).rejects.toThrow();
    expect((await h.repos.accounts.findById(h.account.id))!.historyId).toBe(before);
    // リースは解放されている
    const r = await h.core.sync.syncAccount(h.account.id, "reconcile");
    expect(r.notified).toBe(1);
  });

  it("並行同期はリースで排他し、busy を返す", async () => {
    const h = await connected();
    await h.repos.accounts.tryAcquireSyncLease(h.account.id, "other-worker", 60_000);
    expect((await h.core.sync.syncAccount(h.account.id, "push")).outcome).toBe("busy");
    h.clock.advance(61_000); // 期限切れのリースは奪える
    expect((await h.core.sync.syncAccount(h.account.id, "push")).outcome).toBe("synced");
  });

  it("cursor 期限切れ：本文をコピーせず最近の未読だけ照合して再同期する", async () => {
    const h = await connected();
    h.clock.advance(60_000);
    h.gmail.deliver({ from: "a@example.com", subject: "missed", text: "x" });
    h.gmail.minHistoryId = h.gmail.historyId + 1; // 保存カーソルが古すぎる状態
    const r = await h.core.sync.syncAccount(h.account.id, "push");
    expect(r.outcome).toBe("resynced");
    expect(h.push.sent).toHaveLength(1);
    expect(h.gmail.requests.some((x) => x.path === "/messages" && x.query.get("q")?.includes("is:unread"))).toBe(true);
    expect(h.gmail.requests.some((x) => x.query.get("format") === "full")).toBe(false);
    // 再同期後のカーソルは現在位置
    expect((await h.repos.accounts.findById(h.account.id))!.historyId).toBe(String(h.gmail.historyId));
  });

  it("OAuth失効中は同期しない", async () => {
    const h = await connected();
    await h.repos.accounts.markReauthRequired(h.account.id, "invalid_grant");
    expect((await h.core.sync.handlePushEvent({ emailAddress: "me@example.com", historyId: "999999" })).outcome).toBe("reauth_required");
  });

  it("未知のアカウントのイベントは無視する", async () => {
    const h = await connected();
    expect((await h.core.sync.handlePushEvent({ emailAddress: "x@example.com", historyId: "1" })).outcome).toBe("ignored");
  });

  it("watch 更新：失敗を記録し、次回に再試行する", async () => {
    const h = await connected();
    h.gmail.failNext({ match: /^\/watch$/, status: 403, body: { error: { code: 403, status: "PERMISSION_DENIED" } } });
    const r1 = await h.core.sync.renewAllWatches();
    expect(r1.failed).toBe(1);
    expect((await h.repos.accounts.findById(h.account.id))!.watchLastError).toMatch(/INSUFFICIENT_SCOPE/);
    const r2 = await h.core.sync.renewAllWatches();
    expect(r2.renewed).toBe(1);
    expect((await h.repos.accounts.findById(h.account.id))!.watchLastError).toBeNull();
  });
});

describe("NotificationService", () => {
  it("通知OFFなら送らない（重複排除キーは消費する）", async () => {
    const h = await connected();
    await h.repos.settings.update(h.user.id, { notificationsEnabled: false });
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    await h.core.sync.syncAccount(h.account.id, "push");
    expect(h.push.sent).toHaveLength(0);
    await h.repos.settings.update(h.user.id, { notificationsEnabled: true });
    await h.core.sync.syncAccount(h.account.id, "reconcile");
    expect(h.push.sent).toHaveLength(0);
  });

  it("プレビューOFF：送信者・件名を通知に含めない", async () => {
    const h = await connected();
    h.gmail.deliver({ from: "Secret Sender <s@example.com>", subject: "極秘案件", text: "x" });
    await h.core.sync.syncAccount(h.account.id, "push");
    const msg = h.push.sent[0]!.message;
    expect(JSON.stringify(msg)).not.toMatch(/Secret|極秘|s@example.com/);
    expect(h.gmail.requests.some((r) => r.query.get("format") === "metadata" && r.path.startsWith("/messages/"))).toBe(false);
  });

  it("プレビューON：送信者名と件名を表示する", async () => {
    const h = await connected();
    await h.repos.settings.update(h.user.id, { notificationPreview: true });
    h.gmail.deliver({ from: "山田 <y@example.com>", subject: "会議", text: "x" });
    await h.core.sync.syncAccount(h.account.id, "push");
    expect(h.push.sent[0]!.message).toMatchObject({ title: "山田", body: "会議" });
  });

  it("無効トークンは除外し、他の端末へは届ける", async () => {
    const h = await connected();
    await h.repos.devices.register(h.user.id, "device-token-2", "android");
    h.push.queue.push({ ok: false, kind: "invalid_token", errorCode: "UNREGISTERED" });
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    await h.core.sync.syncAccount(h.account.id, "push");
    expect(h.push.sent).toHaveLength(1);
    expect((await h.repos.devices.listActive(h.user.id)).map((d) => d.token)).toEqual(["device-token-2"]);
  });

  it("FCM一時失敗：プロセス内で再試行し、なお失敗なら定期照合で再送する", async () => {
    const h = await connected();
    const retryable = { ok: false as const, kind: "retryable" as const, errorCode: "UNAVAILABLE" };
    h.push.queue.push(retryable, retryable, retryable);
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    await h.core.sync.syncAccount(h.account.id, "push");
    expect(h.push.sent).toHaveLength(0);
    const [d] = [...h.repos.deliveries.rows.values()];
    expect(d!.status).toBe("failed");
    h.clock.advance(3 * 60 * 60_000);
    const r = await h.core.sync.reconcileAll();
    expect(r.retriedNotifications).toBe(1);
    expect(h.push.sent).toHaveLength(1);
  });

  it("大量の新着（再同期など）は1件のまとめ通知にする", async () => {
    const h = await connected();
    for (let i = 0; i <= BURST_THRESHOLD; i++) h.gmail.deliver({ from: "a@example.com", subject: `${i}`, text: "x" });
    await h.core.sync.syncAccount(h.account.id, "push");
    expect(h.push.sent).toHaveLength(1);
    expect(h.push.sent[0]!.message.body).toContain(`${BURST_THRESHOLD + 1}件`);
  });

  it("端末未登録なら skipped として記録する", async () => {
    const h = await connected();
    await h.repos.devices.deleteAllForUser(h.user.id);
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    await h.core.sync.syncAccount(h.account.id, "push");
    expect([...h.repos.deliveries.rows.values()][0]!.status).toBe("skipped");
  });
});
