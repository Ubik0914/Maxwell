import { afterEach, describe, expect, it } from "vitest";
import * as callback from "@/app/api/auth/google/callback/route";
import * as start from "@/app/api/auth/google/start/route";
import * as handoff from "@/app/api/auth/handoff/route";
import * as disconnect from "@/app/api/account/disconnect/route";
import * as devices from "@/app/api/devices/route";
import * as devicesTest from "@/app/api/devices/test/route";
import * as drafts from "@/app/api/mail/drafts/route";
import * as reply from "@/app/api/mail/messages/[messageId]/reply/route";
import * as search from "@/app/api/mail/search/route";
import * as send from "@/app/api/mail/send/route";
import * as sendStatus from "@/app/api/mail/send/[key]/route";
import * as threads from "@/app/api/mail/threads/route";
import * as thread from "@/app/api/mail/threads/[threadId]/route";
import * as archive from "@/app/api/mail/threads/[threadId]/archive/route";
import * as read from "@/app/api/mail/threads/[threadId]/read/route";
import * as mcpTokens from "@/app/api/mcp-tokens/route";
import * as settings from "@/app/api/settings/route";
import { sha256Hex } from "@synedge/mail-core/server";
import { setContainer } from "./container";
import { OAUTH_COOKIE } from "./auth-flow";
import { connectUser, createTestContainer, params, request } from "./test-utils";

afterEach(() => setContainer(null));

const KEY = "7f1b6a2e-1d5c-4c55-9a8e-2a1f0b3c4d5e";
const none = params({});

describe("認証・認可", () => {
  it("未認証のAPIは 401 と共通エラー形式", async () => {
    await createTestContainer();
    const res = await threads.GET(request("/api/mail/threads"), none);
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.error.code).toBe("UNAUTHENTICATED");
    expect(body.error.correlationId).toMatch(/[0-9a-f-]{36}/);
  });

  it("改ざん・旧版のセッションは無効", async () => {
    const t = await createTestContainer();
    const { cookie, user } = await connectUser(t);
    expect((await threads.GET(request("/api/mail/threads", { cookie: cookie + "x" }), none)).status).toBe(401);
    await t.repos.users.bumpSessionVersion(user.id); // ログアウト・接続解除
    expect((await threads.GET(request("/api/mail/threads", { cookie }), none)).status).toBe(401);
  });

  it("許可リストから外れたユーザーのセッションは無効", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    t.c.env.ALLOWED_EMAILS = ["someone-else@example.com"];
    expect((await threads.GET(request("/api/mail/threads", { cookie }), none)).status).toBe(401);
  });

  it("状態を変える要求は Origin が自サイトでなければ拒否（CSRF）", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const m = t.gmail.addMessage({ from: "a@example.com", subject: "x", text: "x" });
    for (const origin of [null, "https://evil.example.com"]) {
      const res = await archive.POST(request(`/api/mail/threads/${m.threadId}/archive`, { method: "POST", cookie, origin }), params({ threadId: m.threadId }));
      expect(res.status).toBe(403);
    }
    expect(t.gmail.messages.get(m.id)!.labelIds).toContain("INBOX");
  });

  it("JSON以外の本文を拒否する", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const req = request("/api/mail/drafts", { method: "POST", cookie, headers: { "content-type": "text/plain" } });
    expect((await drafts.POST(req, none)).status).toBe(400);
  });
});

describe("メールAPI（mail-core 経由）", () => {
  it("受信トレイ・検索・スレッド・既読・アーカイブ", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const m = t.gmail.addMessage({ from: "山田 <y@example.com>", subject: "見積もり", text: "本文" });
    const list = await (await threads.GET(request("/api/mail/threads?limit=10", { cookie }), none)).json();
    expect(list.items[0]).toMatchObject({ id: m.threadId, subject: "見積もり", unread: true });
    const found = await (await search.GET(request(`/api/mail/search?q=${encodeURIComponent("見積")}`, { cookie }), none)).json();
    expect(found.items).toHaveLength(1);
    const detail = await (await thread.GET(request(`/api/mail/threads/${m.threadId}`, { cookie }), params({ threadId: m.threadId }))).json();
    expect(detail.messages[0].text).toBe("本文");
    expect((await read.POST(request(`/api/mail/threads/${m.threadId}/read`, { method: "POST", cookie }), params({ threadId: m.threadId }))).status).toBe(200);
    expect(t.gmail.messages.get(m.id)!.labelIds).not.toContain("UNREAD");
    expect((await archive.POST(request(`/api/mail/threads/${m.threadId}/archive`, { method: "POST", cookie }), params({ threadId: m.threadId }))).status).toBe(200);
    expect(t.gmail.messages.get(m.id)!.labelIds).not.toContain("INBOX");
  });

  it("入力不正・不正IDは 400、存在しないスレッドは 404", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const bad = await search.GET(request("/api/mail/search?q=", { cookie }), none);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.message).toBe("検索語を入力してください");
    expect((await thread.GET(request("/api/mail/threads/..%2F", { cookie }), params({ threadId: "../" }))).status).toBe(400);
    expect((await thread.GET(request("/api/mail/threads/abc", { cookie }), params({ threadId: "abc" }))).status).toBe(404);
  });

  it("返信の宛先取得 → 送信、同じキーの再送は二重送信しない", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const m = t.gmail.addMessage({ from: "Taro <taro@example.com>", subject: "相談", text: "どう？" });
    const r = await (await reply.GET(request(`/api/mail/messages/${m.id}/reply?mode=reply`, { cookie }), params({ messageId: m.id }))).json();
    expect(r).toMatchObject({ to: ["Taro <taro@example.com>"], subject: "Re: 相談" });
    const body = { to: r.to, subject: r.subject, body: "OK", replyToMessageId: m.id, idempotencyKey: KEY };
    const first = await send.POST(request("/api/mail/send", { method: "POST", cookie, body }), none);
    expect(first.status).toBe(200);
    expect((await first.json()).status).toBe("sent");
    const second = await send.POST(request("/api/mail/send", { method: "POST", cookie, body }), none);
    expect((await second.json()).status).toBe("sent");
    expect(t.gmail.requests.filter((x) => x.path === "/messages/send")).toHaveLength(1);
    const st = await (await sendStatus.GET(request(`/api/mail/send/${KEY}`, { cookie }), params({ key: KEY }))).json();
    expect(st.status).toBe("sent");
  });

  it("送信タイムアウトは SEND_STATUS_UNKNOWN（502）で、内部情報を返さない", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    t.gmail.failNext({ match: /^\/messages\/send$/, throwError: "timeout" });
    const res = await send.POST(request("/api/mail/send", { method: "POST", cookie, body: { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: KEY } }), none);
    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body.error.code).toBe("SEND_STATUS_UNKNOWN");
    expect(JSON.stringify(body)).not.toMatch(/stack|TimeoutError|access-1/);
  });

  it("送信はレート制限される", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const statuses: number[] = [];
    for (let i = 0; i < 7; i++) {
      const res = await send.POST(
        request("/api/mail/send", { method: "POST", cookie, body: { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: crypto.randomUUID() } }),
        none,
      );
      statuses.push(res.status);
    }
    expect(statuses.filter((s) => s === 429).length).toBeGreaterThan(0);
  });

  it("下書きの作成", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const res = await drafts.POST(request("/api/mail/drafts", { method: "POST", cookie, body: { to: ["a@example.com"], subject: "下書き", body: "途中" } }), none);
    expect(res.status).toBe(201);
    expect(t.gmail.drafts.size).toBe(1);
  });

  it("OAuth失効時は REAUTH_REQUIRED（401）", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    t.gmail.validAccessTokens.clear();
    t.gmail.revokedRefresh = true;
    const res = await threads.GET(request("/api/mail/threads", { cookie }), none);
    expect(res.status).toBe(401);
    expect((await res.json()).error.code).toBe("REAUTH_REQUIRED");
  });
});

describe("OAuth・ログイン受け渡し", () => {
  async function begin(t: Awaited<ReturnType<typeof createTestContainer>>, platform = "web") {
    const res = await start.GET(request(`/api/auth/google/start?platform=${platform}&next=/mail?thread=abc`));
    const location = new URL(res.headers.get("location")!);
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    expect(cookie.startsWith(`${OAUTH_COOKIE}=`)).toBe(true);
    void t;
    return { state: location.searchParams.get("state")!, cookie, location };
  }

  it("state 不一致は拒否（CSRF）", async () => {
    const t = await createTestContainer();
    const { cookie } = await begin(t);
    const res = await callback.GET(request(`/api/auth/google/callback?code=good-code&state=wrong`, { cookie }));
    expect(res.headers.get("location")).toContain("/login?error=");
    expect(await t.repos.accounts.listActive()).toHaveLength(0);
  });

  it("成功時：トークンを暗号化保存し、watch を開始し、next へ戻る", async () => {
    const t = await createTestContainer();
    const { state, cookie, location } = await begin(t);
    expect(location.hostname).toBe("accounts.google.com");
    const res = await callback.GET(request(`/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(res.headers.get("location")).toBe("https://app.example.com/mail?thread=abc");
    expect(res.headers.get("set-cookie")).toMatch(/syn_session=.*HttpOnly/i);
    const [acc] = await t.repos.accounts.listActive();
    expect(acc!.refreshTokenEnc).not.toContain(t.gmail.refreshToken);
    expect(acc!.historyId).not.toBeNull();
    expect(t.gmail.watchCalls).toBe(1);
  });

  it("許可されていないアカウントはトークンを保存せず取り消す", async () => {
    const t = await createTestContainer();
    t.google.idTokenEmail = "stranger@example.com";
    const { state, cookie } = await begin(t);
    const res = await callback.GET(request(`/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(decodeURIComponent(res.headers.get("location")!)).toContain("許可されていません");
    expect(await t.repos.accounts.listActive()).toHaveLength(0);
    expect(t.revoked).toHaveLength(1);
  });

  it("Gmail権限が付与されなかった場合は再接続を案内する", async () => {
    const t = await createTestContainer();
    t.google.scope = "openid email";
    const { state, cookie } = await begin(t);
    const res = await callback.GET(request(`/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(decodeURIComponent(res.headers.get("location")!)).toContain("Gmailへのアクセスが許可されませんでした");
  });

  it("Android：ワンタイムコードでアプリへ受け渡し、コードは1回だけ使える", async () => {
    const t = await createTestContainer();
    const { state, cookie } = await begin(t, "android");
    const res = await callback.GET(request(`/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    const loc = res.headers.get("location")!;
    expect(loc).toMatch(/^synedge:\/\/auth\?code=/);
    expect(res.headers.get("set-cookie") ?? "").not.toContain("syn_session=");
    const code = new URL(loc).searchParams.get("code")!;
    const ok = await handoff.GET(request(`/api/auth/handoff?code=${code}`));
    expect(ok.headers.get("location")).toBe("https://app.example.com/mail");
    expect(ok.headers.get("set-cookie")).toContain("syn_session=");
    const again = await handoff.GET(request(`/api/auth/handoff?code=${code}`));
    expect(again.headers.get("location")).toContain("/login?error=");
    t.clock.advance(1); // 未使用
  });
});

describe("通知・設定・MCPトークン・接続解除", () => {
  it("端末登録・テスト通知（実証ゲートの送信経路）", async () => {
    const t = await createTestContainer();
    const { cookie, user } = await connectUser(t);
    expect((await devices.POST(request("/api/devices", { method: "POST", cookie, body: { token: "fcm-token-12345", platform: "android" } }), none)).status).toBe(200);
    expect((await devices.POST(request("/api/devices", { method: "POST", cookie, body: { token: "bad token!", platform: "android" } }), none)).status).toBe(400);
    const r = await (await devicesTest.POST(request("/api/devices/test", { method: "POST", cookie }), none)).json();
    expect(r.outcome).toBe("sent");
    expect(t.push.sent[0]).toMatchObject({ token: "fcm-token-12345" });
    expect((await t.repos.devices.listActive(user.id)).length).toBe(1);
  });

  it("設定の既定値と更新（未知の項目は拒否）", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    expect(await (await settings.GET(request("/api/settings", { cookie }), none)).json()).toEqual({ notificationsEnabled: true, notificationPreview: false });
    const res = await settings.PATCH(request("/api/settings", { method: "PATCH", cookie, body: { notificationPreview: true } }), none);
    expect((await res.json()).notificationPreview).toBe(true);
    expect((await settings.PATCH(request("/api/settings", { method: "PATCH", cookie, body: { admin: true } }), none)).status).toBe(400);
  });

  it("MCPトークンは平文を一度だけ返し、DBにはハッシュのみ", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const created = await (await mcpTokens.POST(request("/api/mcp-tokens", { method: "POST", cookie, body: { name: "Claude" } }), none)).json();
    expect(created.token).toMatch(/^syn_/);
    expect(await t.repos.mcpTokens.findActiveByHash(sha256Hex(created.token))).not.toBeNull();
    const listed = await (await mcpTokens.GET(request("/api/mcp-tokens", { cookie }), none)).json();
    expect(JSON.stringify(listed)).not.toContain(created.token);
  });

  it("接続解除：トークン取り消し・アカウント/端末/配信記録/MCPトークン削除・セッション無効化。Gmailのメールは消さない", async () => {
    const t = await createTestContainer();
    const { cookie, user, account } = await connectUser(t);
    t.gmail.addMessage({ from: "a@example.com", subject: "keep", text: "x" });
    await t.repos.devices.register(user.id, "fcm-token-12345", "android");
    await t.repos.deliveries.claim(account.id, "m1", "t1");
    await t.repos.mcpTokens.create(user.id, "x", "h", "syn_xxxx");
    const res = await disconnect.POST(request("/api/account/disconnect", { method: "POST", cookie }), none);
    expect(res.status).toBe(200);
    expect(t.revoked).toEqual([t.gmail.refreshToken]);
    expect(await t.repos.accounts.listByUser(user.id)).toEqual([]);
    expect(await t.repos.devices.listActive(user.id)).toEqual([]);
    expect(await t.repos.mcpTokens.list(user.id)).toEqual([]);
    expect(t.gmail.requests.some((r) => r.path === "/stop")).toBe(true);
    expect(t.gmail.messages.size).toBe(1);
    expect((await threads.GET(request("/api/mail/threads", { cookie }), none)).status).toBe(401);
  });
});
