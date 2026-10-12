import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
import { createHarness } from "@synedge/mail-core/testing";
import { createLocalJWKSet, exportJWK, generateKeyPair, SignJWT } from "jose";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createHandler } from "./app";

const PUSH_SA = "gmail-push@proj.iam.gserviceaccount.com";
const SCHED_SA = "scheduler@proj.iam.gserviceaccount.com";
const config = {
  pubsubAudience: "https://worker.example.com/pubsub/gmail",
  pubsubServiceAccounts: [PUSH_SA],
  schedulerAudience: "https://worker.example.com/jobs",
  schedulerServiceAccounts: [SCHED_SA],
};

let privateKey: Awaited<ReturnType<typeof generateKeyPair>>["privateKey"];
let jwks: ReturnType<typeof createLocalJWKSet>;
let server: Server | null = null;

beforeAll(async () => {
  const pair = await generateKeyPair("RS256");
  privateKey = pair.privateKey;
  jwks = createLocalJWKSet({ keys: [{ ...(await exportJWK(pair.publicKey)), kid: "k", alg: "RS256" }] });
});

afterEach(() => {
  server?.close();
  server = null;
});

const token = (aud: string, email: string) =>
  new SignJWT({ email, email_verified: true })
    .setProtectedHeader({ alg: "RS256", kid: "k" })
    .setIssuer("https://accounts.google.com")
    .setAudience(aud)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

async function setup() {
  const h = await createHarness();
  await h.core.sync.initializeAccount(h.account.id);
  server = createServer(createHandler({ core: h.core, deliveries: h.repos.deliveries, config, logger: (await import("@synedge/mail-core/server")).silentLogger, jwks, now: () => h.clock.now() }));
  await new Promise<void>((r) => server!.listen(0, r));
  const base = `http://127.0.0.1:${(server!.address() as AddressInfo).port}`;
  const pushEvent = async (historyId: string, auth?: string) =>
    fetch(`${base}/pubsub/gmail`, {
      method: "POST",
      headers: { "content-type": "application/json", authorization: auth ?? `Bearer ${await token(config.pubsubAudience, PUSH_SA)}` },
      body: JSON.stringify({
        message: { data: Buffer.from(JSON.stringify({ emailAddress: "me@example.com", historyId: Number(historyId) })).toString("base64"), messageId: "1" },
        subscription: "projects/proj/subscriptions/gmail-push",
      }),
    });
  return { h, base, pushEvent };
}

describe("worker: Pub/Sub → history → FCM", () => {
  it("正規の push で新着を同期し通知する（ACK=204）", async () => {
    const { h, pushEvent } = await setup();
    h.gmail.deliver({ from: "a@example.com", subject: "新着", text: "x" });
    const res = await pushEvent(String(h.gmail.historyId));
    expect(res.status).toBe(204);
    expect(h.push.sent).toHaveLength(1);
    // 同じイベントの再送（Pub/Subの at-least-once）でも通知は1回
    expect((await pushEvent(String(h.gmail.historyId))).status).toBe(204);
    expect(h.push.sent).toHaveLength(1);
  });

  it("OIDC トークンがない・audience 違い・別サービスアカウントは 401", async () => {
    const { h, pushEvent } = await setup();
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    expect((await pushEvent(String(h.gmail.historyId), "")).status).toBe(401);
    expect((await pushEvent(String(h.gmail.historyId), `Bearer ${await token("https://other", PUSH_SA)}`)).status).toBe(401);
    expect((await pushEvent(String(h.gmail.historyId), `Bearer ${await token(config.pubsubAudience, SCHED_SA)}`)).status).toBe(401);
    expect(h.push.sent).toHaveLength(0);
  });

  it("Gmail の一時障害は 503（Pub/Sub が再送）、再送で回復しカーソルは失わない", async () => {
    const { h, pushEvent } = await setup();
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    h.gmail.failNext({ match: /^\/history$/, status: 503, times: 4 });
    expect((await pushEvent(String(h.gmail.historyId))).status).toBe(503);
    expect(h.push.sent).toHaveLength(0);
    expect((await pushEvent(String(h.gmail.historyId))).status).toBe(204);
    expect(h.push.sent).toHaveLength(1);
  });

  it("同期中（リース取得済み）は 503 で再送させる", async () => {
    const { h, pushEvent } = await setup();
    h.gmail.deliver({ from: "a@example.com", subject: "x", text: "x" });
    await h.repos.accounts.tryAcquireSyncLease(h.account.id, "other", 60_000);
    expect((await pushEvent(String(h.gmail.historyId))).status).toBe(503);
  });

  it("形式不正の push は ACK して捨てる", async () => {
    const { base } = await setup();
    const res = await fetch(`${base}/pubsub/gmail`, {
      method: "POST",
      headers: { authorization: `Bearer ${await token(config.pubsubAudience, PUSH_SA)}` },
      body: JSON.stringify({ message: { data: "bm90IGpzb24=" } }),
    });
    expect(res.status).toBe(204);
  });
});

describe("worker: 定期ジョブ", () => {
  it("watch 更新・定期照合は Scheduler の OIDC が必要", async () => {
    const { h, base } = await setup();
    expect((await fetch(`${base}/jobs/renew-watches`, { method: "POST" })).status).toBe(401);
    const auth = { authorization: `Bearer ${await token(config.schedulerAudience, SCHED_SA)}` };
    const r1 = await fetch(`${base}/jobs/renew-watches`, { method: "POST", headers: auth });
    expect(r1.status).toBe(200);
    expect(await r1.json()).toEqual({ renewed: 1, failed: 0 });

    // push が届かなかった新着を定期照合で補完する
    h.gmail.deliver({ from: "a@example.com", subject: "missed", text: "x" });
    const r2 = await fetch(`${base}/jobs/reconcile`, { method: "POST", headers: auth });
    expect(r2.status).toBe(200);
    expect(h.push.sent).toHaveLength(1);
  });

  it("healthz と 404", async () => {
    const { base } = await setup();
    expect((await fetch(`${base}/healthz`)).status).toBe(200);
    expect((await fetch(`${base}/nope`)).status).toBe(404);
  });
});
