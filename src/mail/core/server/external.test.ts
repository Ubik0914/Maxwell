import { exportJWK, generateKeyPair, SignJWT, createLocalJWKSet } from "jose";
import { describe, expect, it } from "vitest";
import { MemoryAccounts, createMemoryRepositories, repositoryContract } from "../testing";
import { buildFcmPayload, classifyFcmError } from "./fcm";
import { buildAuthUrl, createPkcePair, hasGmailScope, readIdToken } from "./google-oauth";
import { decodeGmailPushData, verifyGoogleOidcToken } from "./google-oidc";

repositoryContract("memory", async () => createMemoryRepositories());

describe("FCM", () => {
  it("エラー分類：UNREGISTERED は無効トークン、503 は再試行、ペイロード不正は致命", () => {
    expect(classifyFcmError(404, { error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } })).toMatchObject({
      kind: "invalid_token",
    });
    expect(classifyFcmError(503, { error: { status: "UNAVAILABLE" } })).toMatchObject({ kind: "retryable" });
    expect(classifyFcmError(429, { error: { details: [{ errorCode: "QUOTA_EXCEEDED" }] } })).toMatchObject({ kind: "retryable" });
    expect(
      classifyFcmError(400, { error: { status: "INVALID_ARGUMENT", message: "The registration token is not a valid FCM registration token" } }),
    ).toMatchObject({ kind: "invalid_token" });
    expect(classifyFcmError(400, { error: { status: "INVALID_ARGUMENT", message: "Invalid JSON payload" } })).toMatchObject({ kind: "fatal" });
    expect(classifyFcmError(403, { error: { details: [{ errorCode: "SENDER_ID_MISMATCH" }] } })).toMatchObject({ kind: "fatal" });
  });

  it("Android 高優先度・通知チャンネル付きのペイロード", () => {
    const p = buildFcmPayload("tok", { title: "t", body: "b", data: { threadId: "x" }, tag: "x" });
    expect(p.message.android).toMatchObject({ priority: "HIGH", notification: { channel_id: "new_mail", tag: "x" } });
    expect(p.message.notification).toEqual({ title: "t", body: "b" });
  });
});

describe("Google OAuth", () => {
  const cfg = { clientId: "cid", clientSecret: "sec", redirectUri: "https://app/cb" };
  it("認可URLは PKCE・state・offline・最小スコープを含む", () => {
    const { challenge } = createPkcePair();
    const url = new URL(buildAuthUrl(cfg, { state: "st", codeChallenge: challenge }));
    expect(url.searchParams.get("code_challenge_method")).toBe("S256");
    expect(url.searchParams.get("state")).toBe("st");
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("scope")).toBe("openid email https://www.googleapis.com/auth/gmail.modify");
    expect(url.toString()).not.toContain("sec");
  });

  it("id_token の aud・iss を検証する", async () => {
    const make = (claims: Record<string, unknown>) =>
      new SignJWT(claims).setProtectedHeader({ alg: "HS256" }).sign(new TextEncoder().encode("k".repeat(32)));
    const good = await make({ iss: "https://accounts.google.com", aud: "cid", sub: "1", email: "Me@Example.com", email_verified: true, exp: Math.floor(Date.now() / 1000) + 60 });
    expect(readIdToken(good, "cid")).toEqual({ email: "me@example.com", emailVerified: true, subject: "1" });
    const badAud = await make({ iss: "https://accounts.google.com", aud: "other", sub: "1", email: "a@b.c" });
    expect(() => readIdToken(badAud, "cid")).toThrow();
    const badIss = await make({ iss: "https://evil.example.com", aud: "cid", sub: "1", email: "a@b.c" });
    expect(() => readIdToken(badIss, "cid")).toThrow();
    expect(hasGmailScope(["openid"])).toBe(false);
  });
});

describe("Pub/Sub OIDC 検証", () => {
  it("署名・audience・サービスアカウントを検証する", async () => {
    const { publicKey, privateKey } = await generateKeyPair("RS256");
    const jwk = { ...(await exportJWK(publicKey)), kid: "k1", alg: "RS256" };
    const jwks = createLocalJWKSet({ keys: [jwk] });
    const sign = (claims: Record<string, unknown>) =>
      new SignJWT(claims)
        .setProtectedHeader({ alg: "RS256", kid: "k1" })
        .setIssuer("https://accounts.google.com")
        .setIssuedAt()
        .setExpirationTime("5m")
        .sign(privateKey);
    const expect_ = { audience: "https://worker/pubsub", serviceAccountEmails: ["push@p.iam.gserviceaccount.com"] };

    const ok = await sign({ aud: expect_.audience, email: "push@p.iam.gserviceaccount.com", email_verified: true });
    expect(await verifyGoogleOidcToken(`Bearer ${ok}`, expect_, jwks)).toEqual({ ok: true, email: "push@p.iam.gserviceaccount.com" });

    const wrongAud = await sign({ aud: "https://other", email: "push@p.iam.gserviceaccount.com", email_verified: true });
    expect((await verifyGoogleOidcToken(`Bearer ${wrongAud}`, expect_, jwks)).ok).toBe(false);
    const wrongSa = await sign({ aud: expect_.audience, email: "evil@x.iam.gserviceaccount.com", email_verified: true });
    expect(await verifyGoogleOidcToken(`Bearer ${wrongSa}`, expect_, jwks)).toEqual({ ok: false, reason: "unexpected_service_account" });
    expect((await verifyGoogleOidcToken(null, expect_, jwks)).ok).toBe(false);

    const { privateKey: otherKey } = await generateKeyPair("RS256");
    const forged = await new SignJWT({ aud: expect_.audience, email: "push@p.iam.gserviceaccount.com", email_verified: true })
      .setProtectedHeader({ alg: "RS256", kid: "k1" })
      .setIssuer("https://accounts.google.com")
      .setExpirationTime("5m")
      .sign(otherKey);
    expect((await verifyGoogleOidcToken(`Bearer ${forged}`, expect_, jwks)).ok).toBe(false);
  });

  it("Gmail 通知データを取り出す", () => {
    const data = Buffer.from(JSON.stringify({ emailAddress: "me@example.com", historyId: 12345 })).toString("base64");
    expect(decodeGmailPushData({ message: { data } })).toEqual({ emailAddress: "me@example.com", historyId: "12345" });
    expect(decodeGmailPushData({ message: { data: "!!!" } })).toBeNull();
    expect(decodeGmailPushData({})).toBeNull();
  });
});

describe("MemoryAccounts", () => {
  it("返り値の変更が保存データに影響しない", async () => {
    const a = new MemoryAccounts();
    const r = await a.upsertConnection({
      userId: "u",
      provider: "gmail",
      email: "x@example.com",
      refreshTokenEnc: "r",
      accessTokenEnc: "a",
      accessTokenExpiresAt: new Date(),
      scopes: ["s"],
    });
    r.scopes.push("mutated");
    expect((await a.findById(r.id))!.scopes).toEqual(["s"]);
  });
});

describe("FcmSender（HTTP v1）", () => {
  it("メタデータサーバーのトークンで送信し、UNREGISTERED を無効トークンとして返す", async () => {
    const { FcmSender } = await import("./fcm");
    const calls: { url: string; headers: Headers; body?: string }[] = [];
    const fetchImpl: typeof fetch = async (input, init) => {
      const url = String(input);
      calls.push({ url, headers: new Headers(init?.headers), body: init?.body as string | undefined });
      if (url.startsWith("http://metadata.google.internal")) return Response.json({ access_token: "meta-token", expires_in: 3600 });
      const body = JSON.parse(String(init?.body)) as { message: { token: string } };
      if (body.message.token === "dead") {
        return Response.json({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }, { status: 404 });
      }
      return Response.json({ name: "projects/p/messages/1" });
    };
    const sender = new FcmSender({ kind: "metadata", projectId: "proj-1" }, fetchImpl);
    expect(await sender.send("tok", { title: "t", body: "b", data: { threadId: "x" } })).toEqual({ ok: true });
    expect(await sender.send("dead", { title: "t", body: "b", data: {} })).toMatchObject({ ok: false, kind: "invalid_token" });
    const send = calls.find((c) => c.url.includes("fcm.googleapis.com"))!;
    expect(send.url).toBe("https://fcm.googleapis.com/v1/projects/proj-1/messages:send");
    expect(send.headers.get("authorization")).toBe("Bearer meta-token");
    expect(calls.find((c) => c.url.includes("metadata"))!.headers.get("metadata-flavor")).toBe("Google");
    // トークンはキャッシュされる
    expect(calls.filter((c) => c.url.includes("metadata"))).toHaveLength(1);
  });
});
