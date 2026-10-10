import { describe, expect, it } from "vitest";
import { MailError } from "../errors";
import { createHarness, parseRawMime } from "../testing";

const KEY = "7f1b6a2e-1d5c-4c55-9a8e-2a1f0b3c4d5e";
const KEY2 = "8f1b6a2e-1d5c-4c55-9a8e-2a1f0b3c4d5e";

async function expectCode(p: Promise<unknown>, code: string) {
  const e = await p.then(
    () => null,
    (err: unknown) => err,
  );
  expect(e).toBeInstanceOf(MailError);
  expect((e as MailError).code).toBe(code);
}

describe("MailService（Gmail実装を通した結合）", () => {
  it("受信トレイのスレッド一覧：送信者・件名・プレビュー・未読・添付", async () => {
    const h = await createHarness();
    h.gmail.addMessage({ from: "山田 <y@example.com>", subject: "見積もり", text: "添付をご確認ください", attachments: [{ filename: "a.pdf", mimeType: "application/pdf", size: 10 }] });
    h.gmail.addMessage({ from: "b@example.com", subject: "既読", text: "x", labelIds: ["INBOX"] });
    h.gmail.addMessage({ from: "c@example.com", subject: "アーカイブ済み", text: "x", labelIds: [] });
    const page = await h.core.mail.listInbox(h.ctx, { limit: 10 });
    expect(page.items).toHaveLength(2);
    const t = page.items.find((i) => i.subject === "見積もり")!;
    expect(t.participants[0]).toEqual({ name: "山田", email: "y@example.com" });
    expect(t.unread).toBe(true);
    expect(t.hasAttachments).toBe(true);
    expect(t.snippet).toContain("添付");
    expect(page.items.find((i) => i.subject === "既読")!.unread).toBe(false);
  });

  it("ページネーション", async () => {
    const h = await createHarness();
    for (let i = 0; i < 5; i++) h.gmail.addMessage({ from: "a@example.com", subject: `s${i}`, text: "x", date: new Date(Date.now() + i * 1000) });
    const p1 = await h.core.mail.listInbox(h.ctx, { limit: 2 });
    expect(p1.items.map((i) => i.subject)).toEqual(["s4", "s3"]);
    const p2 = await h.core.mail.listInbox(h.ctx, { limit: 2, cursor: p1.nextCursor });
    expect(p2.items.map((i) => i.subject)).toEqual(["s2", "s1"]);
  });

  it("検索・スレッド詳細（ISO-2022-JPの本文を復号、HTMLはサニタイズ）", async () => {
    const h = await createHarness();
    const iso2022 = Buffer.from("1b244224332473244b2441244f1b2842", "hex"); // こんにちは
    const m = h.gmail.addMessage({
      from: "a@example.com",
      subject: "古い文字コード",
      textBytes: iso2022,
      charset: "ISO-2022-JP",
      html: '<p>hi<script>x()</script><img src="https://t.example.com/p.gif"></p>',
    });
    const found = await h.core.mail.search(h.ctx, { q: "文字コード" });
    expect(found.items.map((i) => i.id)).toEqual([m.threadId]);
    const thread = await h.core.mail.getThread(h.ctx, m.threadId);
    expect(thread.messages[0]!.text).toBe("こんにちは");
    expect(thread.messages[0]!.html).not.toContain("script");
    expect(thread.messages[0]!.remoteImagesBlocked).toBe(true);
  });

  it("既読・未読・アーカイブがGmailのラベルに反映される", async () => {
    const h = await createHarness();
    const m = h.gmail.addMessage({ from: "a@example.com", subject: "x", text: "x" });
    await h.core.mail.setRead(h.ctx, m.threadId, true);
    expect(h.gmail.messages.get(m.id)!.labelIds).not.toContain("UNREAD");
    await h.core.mail.setRead(h.ctx, m.threadId, false);
    expect(h.gmail.messages.get(m.id)!.labelIds).toContain("UNREAD");
    await h.core.mail.archive(h.ctx, m.threadId);
    expect(h.gmail.messages.get(m.id)!.labelIds).not.toContain("INBOX");
  });

  it("不正なIDは Gmail を呼ばずに INVALID_INPUT", async () => {
    const h = await createHarness();
    const before = h.gmail.requests.length;
    await expectCode(h.core.mail.getThread(h.ctx, "../../etc"), "INVALID_INPUT");
    expect(h.gmail.requests.length).toBe(before);
  });

  it("存在しないスレッドは NOT_FOUND", async () => {
    const h = await createHarness();
    await expectCode(h.core.mail.getThread(h.ctx, "deadbeef"), "NOT_FOUND");
  });

  it("下書きの作成・再編集・取得", async () => {
    const h = await createHarness();
    const { draftId } = await h.core.mail.createDraft(h.ctx, { to: ["a@example.com"], subject: "下書き", body: "途中" });
    await h.core.mail.updateDraft(h.ctx, draftId, { to: ["a@example.com"], bcc: ["b@example.com"], subject: "下書き2", body: "続き" });
    const d = await h.core.mail.getDraft(h.ctx, draftId);
    expect(d).toMatchObject({ subject: "下書き2", body: "続き", to: ["a@example.com"], bcc: ["b@example.com"] });
    const list = await h.core.mail.listDrafts(h.ctx, {});
    expect(list.items.map((x) => x.subject)).toEqual(["下書き2"]);
  });

  it("返信：In-Reply-To/References とスレッドを付け、全員に返信では自分を除く", async () => {
    const h = await createHarness();
    const orig = h.gmail.addMessage({
      from: "Taro <taro@example.com>",
      to: "me@example.com, hanako@example.com",
      cc: "jiro@example.com",
      subject: "相談",
      text: "どう思いますか？",
      messageIdHeader: "<orig@example.com>",
      references: "<root@example.com>",
    });
    const reply = await h.core.mail.prepareReply(h.ctx, orig.id, "replyAll");
    expect(reply.to).toEqual(["Taro <taro@example.com>"]);
    expect(reply.cc.sort()).toEqual(["hanako@example.com", "jiro@example.com"]);
    expect(reply.subject).toBe("Re: 相談");
    expect(reply.quotedOriginal).toContain("> どう思いますか？");

    const r = await h.core.mail.send(h.ctx, {
      to: reply.to,
      cc: reply.cc,
      subject: reply.subject,
      body: "賛成です\n\n" + reply.quotedOriginal,
      replyToMessageId: orig.id,
      idempotencyKey: KEY,
    });
    expect(r.status).toBe("sent");
    expect(r.threadId).toBe(orig.threadId);
    const raw = parseRawMime(h.gmail.lastRawMime()!);
    const hv = (n: string) => raw.headers.find((x) => x.name === n)?.value;
    expect(hv("In-Reply-To")).toBe("<orig@example.com>");
    expect(hv("References")).toBe("<root@example.com> <orig@example.com>");
    expect(raw.body).toContain("賛成です");

    const single = await h.core.mail.prepareReply(h.ctx, orig.id, "reply");
    expect(single.cc).toEqual([]);
  });

  it("二重送信防止：同じキーの再送は送らずに前回結果を返す", async () => {
    const h = await createHarness();
    const input = { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: KEY };
    const [a, b] = await Promise.allSettled([h.core.mail.send(h.ctx, input), h.core.mail.send(h.ctx, input)]);
    const sends = h.gmail.requests.filter((r) => r.path === "/messages/send");
    expect(sends).toHaveLength(1);
    expect([a.status, b.status].sort()).toEqual(["fulfilled", "rejected"]);
    const again = await h.core.mail.send(h.ctx, input);
    expect(again.status).toBe("sent");
    expect(h.gmail.requests.filter((r) => r.path === "/messages/send")).toHaveLength(1);
  });

  it("送信タイムアウト：自動再送せず SEND_STATUS_UNKNOWN、状態照会で送信済みを確認できる", async () => {
    const h = await createHarness();
    h.gmail.failNext({ match: /^\/messages\/send$/, throwError: "timeout" });
    await expectCode(h.core.mail.send(h.ctx, { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: KEY }), "SEND_STATUS_UNKNOWN");
    expect(h.gmail.requests.filter((r) => r.path === "/messages/send")).toHaveLength(1);
    // 同じキーで押し直しても送らない
    await expectCode(h.core.mail.send(h.ctx, { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: KEY }), "SEND_STATUS_UNKNOWN");
    expect(h.gmail.requests.filter((r) => r.path === "/messages/send")).toHaveLength(1);
    // 照会：Gmail に届いていなければ unknown のまま
    expect((await h.core.mail.getSendStatus(h.ctx, KEY)).status).toBe("unknown");
    // 実は届いていた場合（同じ Message-ID が送信済みにある）
    const rec = await h.repos.sends.get(h.user.id, KEY);
    h.gmail.addMessage({ from: "me@example.com", to: "a@example.com", subject: "s", text: "b", labelIds: ["SENT"], messageIdHeader: rec!.rfc822MessageId });
    expect((await h.core.mail.getSendStatus(h.ctx, KEY)).status).toBe("sent");
  });

  it("送信の確定的な失敗（400）は SEND_FAILED/INVALID_INPUT とし、新しいキーで再送できる", async () => {
    const h = await createHarness();
    h.gmail.failNext({ match: /^\/messages\/send$/, status: 400, body: { error: { code: 400, status: "INVALID_ARGUMENT" } } });
    await expectCode(h.core.mail.send(h.ctx, { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: KEY }), "INVALID_INPUT");
    await expectCode(h.core.mail.send(h.ctx, { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: KEY }), "SEND_FAILED");
    const ok = await h.core.mail.send(h.ctx, { to: ["a@example.com"], subject: "s", body: "b", idempotencyKey: KEY2 });
    expect(ok.status).toBe("sent");
  });

  it("下書きから送信：下書きを更新してから drafts.send", async () => {
    const h = await createHarness();
    const { draftId } = await h.core.mail.createDraft(h.ctx, { to: ["a@example.com"], subject: "d", body: "x" });
    const r = await h.core.mail.send(h.ctx, { to: ["a@example.com"], subject: "d", body: "final", draftId, idempotencyKey: KEY });
    expect(r.status).toBe("sent");
    expect(h.gmail.drafts.size).toBe(0);
    expect(h.gmail.messages.get(r.messageId!)!.text).toBe("final");
  });

  it("送信入力の検証（宛先・件名・本文必須）はGmailを呼ばない", async () => {
    const h = await createHarness();
    await expectCode(h.core.mail.send(h.ctx, { to: [], subject: "s", body: "b", idempotencyKey: KEY }), "INVALID_INPUT");
    await expectCode(h.core.mail.send(h.ctx, { to: ["a@example.com"], subject: "", body: "b", idempotencyKey: KEY }), "INVALID_INPUT");
    expect(h.gmail.requests.filter((r) => r.path === "/messages/send")).toHaveLength(0);
  });

  it("アクセストークン期限切れ：refresh して続行する", async () => {
    const h = await createHarness();
    h.gmail.validAccessTokens.clear(); // 保存済みトークンが失効
    h.gmail.addMessage({ from: "a@example.com", subject: "x", text: "x" });
    const page = await h.core.mail.listInbox(h.ctx, {});
    expect(page.items).toHaveLength(1);
  });

  it("OAuth失効（invalid_grant）：REAUTH_REQUIRED になりアカウントが再接続待ちになる", async () => {
    const h = await createHarness();
    h.gmail.validAccessTokens.clear();
    h.gmail.revokedRefresh = true;
    await expectCode(h.core.mail.listInbox(h.ctx, {}), "REAUTH_REQUIRED");
    expect((await h.repos.accounts.findById(h.account.id))!.status).toBe("reauth_required");
    await expectCode(h.core.mail.listInbox(h.ctx, {}), "REAUTH_REQUIRED");
  });

  it("Gmail API のエラー分類：429→再試行後 RATE_LIMITED、403 権限不足→INSUFFICIENT_SCOPE", async () => {
    const h = await createHarness();
    h.gmail.failNext({ match: /^\/threads$/, status: 429, times: 4 });
    await expectCode(h.core.mail.listInbox(h.ctx, {}), "RATE_LIMITED");
    h.gmail.failNext({
      match: /^\/threads$/,
      status: 403,
      body: { error: { code: 403, status: "PERMISSION_DENIED", errors: [{ reason: "insufficientPermissions" }] } },
    });
    await expectCode(h.core.mail.listInbox(h.ctx, {}), "INSUFFICIENT_SCOPE");
  });

  it("一時的な 503 は再試行で回復する", async () => {
    const h = await createHarness();
    h.gmail.failNext({ match: /^\/threads$/, status: 503, times: 2 });
    expect((await h.core.mail.listInbox(h.ctx, {})).items).toEqual([]);
  });

  it("他ユーザーは本人のアカウントへ到達できない", async () => {
    const h = await createHarness();
    const other = await h.repos.users.upsertByEmail("other@example.com");
    await expectCode(h.core.mail.listInbox({ userId: other.id }, {}), "NOT_CONNECTED");
  });
});
