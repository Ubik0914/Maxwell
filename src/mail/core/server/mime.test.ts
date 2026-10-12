import { describe, expect, it } from "vitest";
import { parseRawMime } from "../testing/fake-gmail";
import { buildMimeMessage, buildReferences, encodeWord, replySubject, toBase64Url } from "./mime";

describe("MIME生成", () => {
  it("日本語の件名・表示名をRFC 2047で、本文をUTF-8 base64でエンコードする", () => {
    const { raw, messageId } = buildMimeMessage({
      to: ["山田 太郎 <taro@example.com>"],
      cc: ["hanako@example.com"],
      bcc: [],
      subject: "【確認】来週の打ち合わせについて",
      body: "お世話になっております。\n日程の件、承知しました。",
      date: new Date("2026-10-10T01:02:03Z"),
    });
    expect(raw).toContain("To: =?UTF-8?B?");
    expect(raw).toMatch(/Subject: =\?UTF-8\?B\?[A-Za-z0-9+/=]+\?=/);
    expect(raw).toContain('Content-Type: text/plain; charset="UTF-8"');
    expect(raw).toContain("Content-Transfer-Encoding: base64");
    expect(raw).toContain(`Message-ID: ${messageId}`);
    // 改行はすべて CRLF
    expect(raw.replace(/\r\n/g, "")).not.toMatch(/[\r\n]/);

    const parsed = parseRawMime(raw);
    const h = (n: string) => parsed.headers.find((x) => x.name === n)?.value;
    expect(h("Subject")).toBe("【確認】来週の打ち合わせについて");
    expect(h("To")).toBe("山田 太郎 <taro@example.com>");
    expect(parsed.body).toBe("お世話になっております。\r\n日程の件、承知しました。");
  });

  it("長い件名は75文字以内の encoded-word に分割し、文字境界を壊さない", () => {
    const subject = "あ".repeat(40) + "🎉絵文字" + "い".repeat(40);
    const encoded = encodeWord(subject);
    for (const word of encoded.split("\r\n ")) expect(word.length).toBeLessThanOrEqual(75);
    const { raw } = buildMimeMessage({ to: ["a@example.com"], cc: [], bcc: [], subject, body: "x" });
    expect(parseRawMime(raw).headers.find((x) => x.name === "Subject")?.value).toBe(subject);
  });

  it("ASCII の件名はそのまま、本文の base64 は76文字で折り返す", () => {
    const { raw } = buildMimeMessage({ to: ["a@example.com"], cc: [], bcc: [], subject: "Hello", body: "x".repeat(500) });
    expect(raw).toContain("Subject: Hello\r\n");
    const body = raw.split("\r\n\r\n")[1]!;
    for (const line of body.split("\r\n")) expect(line.length).toBeLessThanOrEqual(76);
  });

  it("ヘッダーインジェクションを拒否する", () => {
    expect(() =>
      buildMimeMessage({ to: ["a@example.com"], cc: [], bcc: [], subject: "x\r\nBcc: evil@example.com", body: "" }),
    ).toThrow(/改行/);
    expect(() => buildMimeMessage({ to: ["a@example.com\r\nBcc: e@x.com"], cc: [], bcc: [], subject: "x", body: "" })).toThrow();
  });

  it("返信ヘッダーを付ける", () => {
    const { raw } = buildMimeMessage({
      to: ["a@example.com"],
      cc: [],
      bcc: ["b@example.com"],
      subject: "Re: x",
      body: "y",
      inReplyTo: "<p@x>",
      references: "<o@x> <p@x>",
    });
    expect(raw).toContain("In-Reply-To: <p@x>\r\n");
    expect(raw).toContain("References: <o@x> <p@x>\r\n");
    expect(raw).toContain("Bcc: b@example.com\r\n");
  });

  it("base64url はパディングと +/ を含まない", () => {
    const enc = toBase64Url("ü?>".repeat(10));
    expect(enc).not.toMatch(/[+/=]/);
  });

  it("References と返信件名", () => {
    expect(buildReferences("<a@x> <b@x>", "<c@x>")).toBe("<a@x> <b@x> <c@x>");
    expect(buildReferences(null, null)).toBeNull();
    expect(replySubject("会議")).toBe("Re: 会議");
    expect(replySubject("Re: 会議")).toBe("Re: 会議");
    expect(replySubject("RE：会議")).toBe("RE：会議");
  });
});
