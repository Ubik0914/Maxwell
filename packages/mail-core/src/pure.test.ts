import { describe, expect, it } from "vitest";
import { formatAddress, parseAddressList, uniqueAddresses } from "./address";
import { splitQuotedText, stripQuoted, quoteForReply } from "./quote";
import { sendInputSchema, searchQuerySchema } from "./schemas";

describe("アドレス解析", () => {
  it("引用符・カンマ・日本語表示名を扱う", () => {
    const list = parseAddressList('"Yamada, Taro" <taro@example.com>, 花子 <hanako@example.com>; plain@example.com');
    expect(list).toEqual([
      { name: "Yamada, Taro", email: "taro@example.com" },
      { name: "花子", email: "hanako@example.com" },
      { email: "plain@example.com" },
    ]);
    expect(formatAddress(list[0]!)).toBe('"Yamada, Taro" <taro@example.com>');
  });

  it("重複と自分を除く", () => {
    const list = uniqueAddresses([{ email: "A@x.com" }, { email: "a@x.com" }, { email: "me@x.com" }], ["ME@x.com"]);
    expect(list).toEqual([{ email: "A@x.com" }]);
  });
});

describe("引用判別", () => {
  it("返信本文と引用ブロックを分ける", () => {
    const text = [
      "了解です。",
      "",
      "On Mon, Oct 5, 2026 at 10:00 AM Taro <taro@example.com> wrote:",
      "> 明日の件",
      ">",
      "> よろしく",
    ].join("\n");
    const segs = splitQuotedText(text);
    expect(segs.map((s) => s.kind)).toEqual(["text", "quote"]);
    expect(segs[1]!.content).toContain("wrote:");
    expect(stripQuoted(text)).toBe("了解です。");
  });

  it("日本語の帰属行も引用に含める", () => {
    const segs = splitQuotedText("OK\n2026年10月5日(月) 10:00 山田 <y@example.com>:\n> 本文");
    expect(segs).toEqual([
      { kind: "text", content: "OK" },
      { kind: "quote", content: "2026年10月5日(月) 10:00 山田 <y@example.com>:\n> 本文" },
    ]);
  });

  it("返信用の引用を作る", () => {
    expect(quoteForReply("a\n\nb", "X:")).toBe("X:\n> a\n>\n> b");
  });
});

describe("入力検証", () => {
  const base = {
    to: ["a@example.com"],
    subject: "件名",
    body: "本文",
    idempotencyKey: "7f1b6a2e-1d5c-4c55-9a8e-2a1f0b3c4d5e",
  };
  it("送信は宛先・件名・本文が必須", () => {
    expect(sendInputSchema.safeParse(base).success).toBe(true);
    expect(sendInputSchema.safeParse({ ...base, to: [] }).success).toBe(false);
    expect(sendInputSchema.safeParse({ ...base, subject: " " }).success).toBe(false);
    expect(sendInputSchema.safeParse({ ...base, body: "" }).success).toBe(false);
    expect(sendInputSchema.safeParse({ ...base, to: ["not-an-email"] }).success).toBe(false);
    expect(sendInputSchema.safeParse({ ...base, idempotencyKey: "x" }).success).toBe(false);
  });
  it("件名・宛先の改行を拒否する", () => {
    expect(sendInputSchema.safeParse({ ...base, subject: "a\nBcc: x@y.z" }).success).toBe(false);
    expect(sendInputSchema.safeParse({ ...base, to: ["a@example.com\nBcc: x@y.z"] }).success).toBe(false);
  });
  it("検索語の長さ上限", () => {
    expect(searchQuerySchema.safeParse({ q: "from:a@example.com" }).success).toBe(true);
    expect(searchQuerySchema.safeParse({ q: "x".repeat(501) }).success).toBe(false);
    expect(searchQuerySchema.safeParse({ q: "a", limit: 999 }).success).toBe(false);
  });
});
