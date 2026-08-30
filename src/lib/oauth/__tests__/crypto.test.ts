import { createHash } from "node:crypto";
import {
  generateAuthorizationCode,
  generateClientId,
  sha256Hex,
  verifyPkceS256,
} from "@/lib/oauth/crypto";

describe("generateAuthorizationCode", () => {
  it("is high-entropy and url-safe", () => {
    const code = generateAuthorizationCode();
    expect(code).toMatch(/^[A-Za-z0-9_-]{40,}$/);
  });

  it("never repeats", () => {
    const codes = new Set(
      Array.from({ length: 50 }, () => generateAuthorizationCode()),
    );
    expect(codes.size).toBe(50);
  });
});

describe("generateClientId", () => {
  it("is a UUID", () => {
    expect(generateClientId()).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/,
    );
  });
});

describe("sha256Hex", () => {
  it("matches node:crypto directly", () => {
    expect(sha256Hex("hello")).toBe(
      createHash("sha256").update("hello").digest("hex"),
    );
  });

  it("is deterministic", () => {
    expect(sha256Hex("same input")).toBe(sha256Hex("same input"));
  });
});

describe("verifyPkceS256", () => {
  it("accepts the verifier that produced the challenge", () => {
    const verifier = "a".repeat(43);
    const challenge = createHash("sha256")
      .update(verifier)
      .digest("base64url");
    expect(verifyPkceS256(verifier, challenge)).toBe(true);
  });

  it("rejects a wrong verifier", () => {
    const challenge = createHash("sha256")
      .update("a".repeat(43))
      .digest("base64url");
    expect(verifyPkceS256("b".repeat(43), challenge)).toBe(false);
  });

  it("rejects a mismatched length rather than throwing", () => {
    // timingSafeEqual throws on unequal-length buffers if not guarded.
    expect(verifyPkceS256("a".repeat(43), "too-short")).toBe(false);
  });
});
