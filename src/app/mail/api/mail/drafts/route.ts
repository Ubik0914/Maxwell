import { json, readJson, route, searchParamsObject } from "@/mail/server/http";

export const GET = route(async ({ c, session, req }) => json(await c.core.mail.listDrafts(session, searchParamsObject(req))));

export const POST = route(
  async ({ c, session, req }) => json(await c.core.mail.createDraft(session, await readJson(req)), { status: 201 }),
  { mutating: true },
);
