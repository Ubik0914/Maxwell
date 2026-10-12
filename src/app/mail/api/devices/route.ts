import { deviceRegisterSchema, firstIssueMessage, MailError } from "@/mail/core";
import { json, readJson, route } from "@/mail/server/http";

/** FCM 端末トークンの登録（アプリ起動・トークン更新のたびに呼ばれる） */
export const POST = route(
  async ({ c, session, req }) => {
    const r = deviceRegisterSchema.safeParse(await readJson(req));
    if (!r.success) throw new MailError("INVALID_INPUT", firstIssueMessage(r.error));
    await c.repos.devices.register(session.userId, r.data.token, r.data.platform);
    return json({ ok: true });
  },
  { mutating: true },
);

export const DELETE = route(
  async ({ c, session, req }) => {
    const r = deviceRegisterSchema.pick({ token: true }).safeParse(await readJson(req));
    if (!r.success) throw new MailError("INVALID_INPUT", firstIssueMessage(r.error));
    await c.repos.devices.remove(session.userId, r.data.token);
    return json({ ok: true });
  },
  { mutating: true },
);

export const GET = route(async ({ c, session }) => {
  const devices = await c.repos.devices.listActive(session.userId);
  return json({ count: devices.length, platforms: devices.map((d) => d.platform) });
});
