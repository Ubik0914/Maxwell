import { afterEach, describe, expect, it } from "vitest";
import * as callback from "@/app/mail/api/auth/google/callback/route";
import * as start from "@/app/mail/api/auth/google/start/route";
import * as ticket from "@/app/mail/api/auth/google/ticket/route";
import * as disconnect from "@/app/mail/api/account/disconnect/route";
import * as devices from "@/app/mail/api/devices/route";
import * as devicesTest from "@/app/mail/api/devices/test/route";
import * as drafts from "@/app/mail/api/mail/drafts/route";
import * as reply from "@/app/mail/api/mail/messages/[messageId]/reply/route";
import * as search from "@/app/mail/api/mail/search/route";
import * as send from "@/app/mail/api/mail/send/route";
import * as sendStatus from "@/app/mail/api/mail/send/[key]/route";
import * as threads from "@/app/mail/api/mail/threads/route";
import * as thread from "@/app/mail/api/mail/threads/[threadId]/route";
import * as archive from "@/app/mail/api/mail/threads/[threadId]/archive/route";
import * as read from "@/app/mail/api/mail/threads/[threadId]/read/route";
import * as settings from "@/app/mail/api/settings/route";
import * as v1Search from "@/app/api/v1/mail/search/route";
import * as v1Thread from "@/app/api/v1/mail/threads/[threadId]/route";
import * as v1Drafts from "@/app/api/v1/mail/drafts/route";
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

  it("Maxwell からログアウトすると 401（メール側にセッションはない）", async () => {
    const t = await createTestContainer();
    const { cookie, user } = await connectUser(t);
    expect((await threads.GET(request("/api/mail/threads", { cookie }), none)).status).toBe(200);
    t.signOut(user.id);
    expect((await threads.GET(request("/api/mail/threads", { cookie }), none)).status).toBe(401);
  });

  it("ログイン済みでも Gmail 未接続なら NOT_CONNECTED。他人の Gmail には届かない", async () => {
    const t = await createTestContainer();
    await connectUser(t);
    const other = t.signIn("other@example.com");
    const res = await threads.GET(request("/api/mail/threads", { cookie: other.cookie }), none);
    expect(res.status).toBe(409);
    expect((await res.json()).error.code).toBe("NOT_CONNECTED");
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

describe("Gmail の接続（OAuth）", () => {
  async function begin(t: Awaited<ReturnType<typeof createTestContainer>>, login = t.signIn()) {
    const res = await start.GET(request(`/mail/api/auth/google/start?platform=web&next=/mail?thread=abc`, { cookie: login.cookie }));
    const location = new URL(res.headers.get("location")!);
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    expect(cookie.startsWith(`${OAUTH_COOKIE}=`)).toBe(true);
    return { state: location.searchParams.get("state")!, cookie, location, login };
  }

  it("未ログインで始めると Maxwell のログインへ", async () => {
    await createTestContainer();
    const res = await start.GET(request(`/mail/api/auth/google/start?platform=web`));
    expect(res.headers.get("location")).toBe("https://app.example.com/login?next=%2Fmail%2Fsettings");
  });

  it("state 不一致は拒否（CSRF）", async () => {
    const t = await createTestContainer();
    const { cookie } = await begin(t);
    const res = await callback.GET(request(`/mail/api/auth/google/callback?code=good-code&state=wrong`, { cookie }));
    expect(res.headers.get("location")).toContain("/mail/settings?error=");
    expect(await t.repos.accounts.listActive()).toHaveLength(0);
  });

  it("成功時：ログイン中の利用者に紐づけ、トークンを暗号化保存し、watch を開始し、next へ戻る", async () => {
    const t = await createTestContainer();
    const { state, cookie, location, login } = await begin(t);
    expect(location.hostname).toBe("accounts.google.com");
    const res = await callback.GET(request(`/mail/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(res.headers.get("location")).toBe("https://app.example.com/mail?thread=abc");
    const [acc] = await t.repos.accounts.listActive();
    expect(acc!.userId).toBe(login.id);
    expect(acc!.refreshTokenEnc).not.toContain(t.gmail.refreshToken);
    expect(acc!.historyId).not.toBeNull();
    expect(t.gmail.watchCalls).toBe(1);
  });

  it("next はメールの画面だけ（オープンリダイレクト防止）", async () => {
    const t = await createTestContainer();
    const login = t.signIn();
    const res = await start.GET(request(`/mail/api/auth/google/start?platform=web&next=//evil.example.com`, { cookie: login.cookie }));
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const done = await callback.GET(request(`/mail/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(done.headers.get("location")).toBe("https://app.example.com/mail/settings");
  });

  it("許可されていないアカウントはトークンを保存せず取り消す", async () => {
    const t = await createTestContainer();
    t.google.idTokenEmail = "stranger@example.com";
    const { state, cookie } = await begin(t);
    const res = await callback.GET(request(`/mail/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(decodeURIComponent(res.headers.get("location")!)).toContain("許可されていません");
    expect(await t.repos.accounts.listActive()).toHaveLength(0);
    expect(t.revoked).toHaveLength(1);
  });

  it("別の利用者に接続済みの Gmail は横取りできない", async () => {
    const t = await createTestContainer();
    await connectUser(t);
    const { state, cookie } = await begin(t, t.signIn("other@example.com"));
    const res = await callback.GET(request(`/mail/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(res.headers.get("location")).toContain("/mail/settings?error=");
    expect(await t.repos.accounts.listActive()).toHaveLength(1);
  });

  it("Gmail権限が付与されなかった場合は再接続を案内する", async () => {
    const t = await createTestContainer();
    t.google.scope = "openid email";
    const { state, cookie } = await begin(t);
    const res = await callback.GET(request(`/mail/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(decodeURIComponent(res.headers.get("location")!)).toContain("Gmailへのアクセスが許可されませんでした");
  });

  it("Android：WebView で発行したチケットで外部ブラウザから接続し、アプリへ戻す", async () => {
    const t = await createTestContainer();
    const login = t.signIn();
    // チケット発行は状態を変える要求：自サイトの Origin が必要
    expect((await ticket.POST(request("/mail/api/auth/google/ticket", { method: "POST", cookie: login.cookie, body: {}, origin: null }), none)).status).toBe(403);
    expect((await ticket.POST(request("/mail/api/auth/google/ticket", { method: "POST", body: {} }), none)).status).toBe(401);
    const { url } = await (await ticket.POST(request("/mail/api/auth/google/ticket", { method: "POST", cookie: login.cookie, body: { next: "/mail/settings" } }), none)).json();
    // 外部ブラウザ：ログイン Cookie なし、チケットだけ
    const startUrl = new URL(url);
    expect(startUrl.pathname).toBe("/mail/api/auth/google/start");
    const res = await start.GET(request(startUrl.pathname + startUrl.search));
    const state = new URL(res.headers.get("location")!).searchParams.get("state")!;
    const cookie = res.headers.get("set-cookie")!.split(";")[0]!;
    const done = await callback.GET(request(`/mail/api/auth/google/callback?code=good-code&state=${state}`, { cookie }));
    expect(done.headers.get("location")).toBe("synedge://auth?result=connected");
    expect((await t.repos.accounts.listActive())[0]!.userId).toBe(login.id);
    // 改ざん・期限切れのチケットは使えない（ログインへ回される）
    const bad = await start.GET(request(`/mail/api/auth/google/start?ticket=${encodeURIComponent(startUrl.searchParams.get("ticket")! + "x")}`));
    expect(bad.headers.get("location")).toContain("/login?next=");
  });
});

describe("通知・設定・接続解除", () => {
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


  it("接続解除：トークン取り消し・アカウント/端末/配信記録の削除。Gmailのメールは消さず、Maxwell のログインはそのまま", async () => {
    const t = await createTestContainer();
    const { cookie, user, account } = await connectUser(t);
    t.gmail.addMessage({ from: "a@example.com", subject: "keep", text: "x" });
    await t.repos.devices.register(user.id, "fcm-token-12345", "android");
    await t.repos.deliveries.claim(account.id, "m1", "t1");
    const res = await disconnect.POST(request("/api/account/disconnect", { method: "POST", cookie }), none);
    expect(res.status).toBe(200);
    expect(t.revoked).toEqual([t.gmail.refreshToken]);
    expect(await t.repos.accounts.listByUser(user.id)).toEqual([]);
    expect(await t.repos.devices.listActive(user.id)).toEqual([]);
    expect(t.gmail.requests.some((r) => r.path === "/stop")).toBe(true);
    expect(t.gmail.messages.size).toBe(1);
    expect((await threads.GET(request("/api/mail/threads", { cookie }), none)).status).toBe(409);
  });
});

describe("/api/v1/mail（MCP が使う API）", () => {
  it("検索・スレッドは { data } で返し、外部データの注意書きを付ける", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const m = t.gmail.addMessage({ from: "a@example.com", subject: "見積の件", text: "本文です\n\n> 引用" });
    const found = await (await v1Search.GET(request(`/api/v1/mail/search?query=${encodeURIComponent("見積")}`, { cookie }), none)).json();
    expect(found.data.notice).toContain("信頼できないデータ");
    expect(found.data.email_data[0].thread_id).toBe(m.threadId);
    const th = await (await v1Thread.GET(request(`/api/v1/mail/threads/${m.threadId}?for_summary=1`, { cookie }), params({ threadId: m.threadId }))).json();
    expect(th.data.email_data.messages[0].body).not.toContain("> 引用");
    expect(th.data.email_data.participants).toBeDefined();
    const bad = await v1Search.GET(request(`/api/v1/mail/search`, { cookie }), none);
    expect(bad.status).toBe(400);
    expect((await bad.json()).error.code).toBe("INVALID_INPUT");
  });

  it("下書き保存：Cookie だけなら Origin が要る。Bearer の要求（MCP）は Origin なしで通る", async () => {
    const t = await createTestContainer();
    const { cookie } = await connectUser(t);
    const body = { to: ["a@example.com"], subject: "下書き", body: "途中" };
    expect((await v1Drafts.POST(request("/api/v1/mail/drafts", { method: "POST", cookie, body, origin: null }), none)).status).toBe(403);
    const ok = await v1Drafts.POST(
      request("/api/v1/mail/drafts", { method: "POST", cookie, body, origin: null, headers: { authorization: "Bearer token" } }),
      none,
    );
    expect(ok.status).toBe(200);
    expect((await ok.json()).data.draft_id).toBeTruthy();
  });
});
