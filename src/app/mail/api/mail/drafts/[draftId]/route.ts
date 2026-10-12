import { json, readJson, route } from "@/mail/server/http";

export const GET = route<{ draftId: string }>(async ({ c, session }, { draftId }) => json(await c.core.mail.getDraft(session, draftId)));

export const PATCH = route<{ draftId: string }>(
  async ({ c, session, req }, { draftId }) => json(await c.core.mail.updateDraft(session, draftId, await readJson(req))),
  { mutating: true },
);
