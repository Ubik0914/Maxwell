import { describe, expect, it } from "vitest";
import { splitRecipients } from "./compose";
import { connectResultFromDeepLink, urlForNotification } from "./native";

describe("通知タップ・ディープリンク", () => {
  it("通知データのスレッドIDだけで遷移先を決め、不正な値は受信トレイへ", () => {
    expect(urlForNotification({ threadId: "18c2a3f", kind: "new_mail" })).toBe("/mail?thread=18c2a3f");
    expect(urlForNotification({ threadId: "javascript:alert(1)" })).toBe("/mail");
    expect(urlForNotification({ kind: "new_mail_batch" })).toBe("/mail");
    expect(urlForNotification(undefined)).toBe("/mail");
  });

  it("synedge://auth の接続結果だけを設定画面のパスにする", () => {
    expect(connectResultFromDeepLink("synedge://auth?result=connected")).toBe("/mail/settings?connected=1");
    expect(connectResultFromDeepLink("synedge://auth?error=%E5%A4%B1%E6%95%97")).toBe(`/mail/settings?error=${encodeURIComponent("失敗")}`);
    expect(connectResultFromDeepLink("synedge://other?result=connected")).toBeNull();
    expect(connectResultFromDeepLink("synedge://auth")).toBeNull();
    expect(connectResultFromDeepLink("not a url")).toBeNull();
  });
});

describe("宛先入力", () => {
  it("カンマ・セミコロン区切りと表示名を扱う", () => {
    expect(splitRecipients('山田 <y@example.com>, "Doe, John" <j@example.com>; z@example.com')).toEqual([
      "山田 <y@example.com>",
      '"Doe, John" <j@example.com>',
      "z@example.com",
    ]);
    expect(splitRecipients("  ")).toEqual([]);
  });
});
