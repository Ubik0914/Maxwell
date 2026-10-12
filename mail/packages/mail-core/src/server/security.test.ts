import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TokenCipher } from "./crypto";
import { createLogger } from "./logger";
import { htmlToText, sanitizeEmailHtml } from "./sanitize";

describe("HTMLサニタイズ", () => {
  it("script・イベントハンドラ・javascript: を除去する", () => {
    const { html } = sanitizeEmailHtml(
      `<p onclick="alert(1)">hi</p><script>alert(1)</script><a href="javascript:alert(1)">x</a><iframe src="https://e.com"></iframe><form><input></form>`,
      { allowRemoteImages: false },
    );
    expect(html).not.toMatch(/script|onclick|javascript:|iframe|<form|<input/i);
    expect(html).toContain("<p>hi</p>");
  });

  it("リモート画像と CSS url() を既定でブロックする", () => {
    const r = sanitizeEmailHtml(
      `<img src="https://tracker.example.com/p.gif" alt="t"><div style="color:red;background:url(https://t.example.com/x)">a</div><img src="data:image/png;base64,AAAA">`,
      { allowRemoteImages: false },
    );
    expect(r.remoteImagesBlocked).toBe(true);
    expect(r.html).not.toContain("tracker.example.com");
    expect(r.html).not.toContain("t.example.com");
    expect(r.html).toContain("color:red");
    expect(r.html).toContain("data:image/png");
  });

  it("許可時はリモート画像を残す", () => {
    const r = sanitizeEmailHtml(`<img src="https://img.example.com/a.png">`, { allowRemoteImages: true });
    expect(r.html).toContain("https://img.example.com/a.png");
    expect(r.remoteImagesBlocked).toBe(false);
  });

  it("リンクは新しいタブで noopener 付きで開く", () => {
    const { html } = sanitizeEmailHtml(`<a href="https://example.com">x</a>`, { allowRemoteImages: false });
    expect(html).toContain('target="_blank"');
    expect(html).toContain('rel="noopener noreferrer nofollow"');
  });

  it("HTMLからテキストを取り出す", () => {
    expect(htmlToText("<p>a&amp;b</p><div>c<br>d</div><script>x</script>")).toBe("a&b\nc\nd");
  });
});

describe("トークン暗号化", () => {
  const key = () => randomBytes(32).toString("base64");
  it("暗号化・復号でき、AADが違えば失敗する", () => {
    const c = new TokenCipher(`k1:${key()}`);
    const enc = c.encrypt("refresh-token", "refresh:acc1");
    expect(enc).not.toContain("refresh-token");
    expect(c.decrypt(enc, "refresh:acc1")).toBe("refresh-token");
    expect(() => c.decrypt(enc, "refresh:acc2")).toThrow();
  });
  it("鍵ローテーション：旧鍵の暗号文も読める", () => {
    const k0 = key();
    const old = new TokenCipher(`k0:${k0}`);
    const enc = old.encrypt("x", "a");
    const rotated = new TokenCipher(`k1:${key()},k0:${k0}`);
    expect(rotated.decrypt(enc, "a")).toBe("x");
    expect(rotated.needsRotation(enc)).toBe(true);
  });
  it("不正な鍵長を拒否する", () => {
    expect(() => new TokenCipher("k1:c2hvcnQ=")).toThrow(/32バイト/);
  });
});

describe("ログのマスク", () => {
  it("本文・件名・アドレス・トークンを出力しない", () => {
    const lines: string[] = [];
    const log = createLogger({}, { sink: (l) => lines.push(l), level: "debug" });
    log.info("test", {
      accountId: "acc-1",
      subject: "秘密の件名",
      body: "本文",
      from: "a@example.com",
      authorization: "Bearer ya29.secret",
      note: "user a@example.com sent Bearer abc.def and ya29.xyz",
      error: new Error("token 1//refresh-secret leaked"),
    });
    const out = lines.join("\n");
    expect(out).toContain("acc-1");
    for (const secret of ["秘密の件名", "本文", "a@example.com", "ya29.secret", "ya29.xyz", "abc.def", "1//refresh-secret"]) {
      expect(out).not.toContain(secret);
    }
  });
});
