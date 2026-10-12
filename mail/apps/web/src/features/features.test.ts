import { describe, expect, it } from "vitest";
import { splitRecipients } from "./compose";
import { handoffUrlFromDeepLink, urlForNotification } from "./native";

describe("通知タップ・ディープリンク", () => {
  it("通知データのスレッドIDだけで遷移先を決め、不正な値は受信トレイへ", () => {
    expect(urlForNotification({ threadId: "18c2a3f", kind: "new_mail" })).toBe("/mail?thread=18c2a3f");
    expect(urlForNotification({ threadId: "javascript:alert(1)" })).toBe("/mail");
    expect(urlForNotification({ kind: "new_mail_batch" })).toBe("/mail");
    expect(urlForNotification(undefined)).toBe("/mail");
  });

  it("synedge://auth?code=... だけをログイン受け渡しとして扱う", () => {
    const code = "a".repeat(43);
    expect(handoffUrlFromDeepLink(`synedge://auth?code=${code}`)).toBe(`/api/auth/handoff?code=${code}`);
    expect(handoffUrlFromDeepLink(`synedge://other?code=${code}`)).toBeNull();
    expect(handoffUrlFromDeepLink("synedge://auth?code=<script>")).toBeNull();
    expect(handoffUrlFromDeepLink("not a url")).toBeNull();
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
