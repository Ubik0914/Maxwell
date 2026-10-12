import { firstIssueMessage, MailError, settingsPatchSchema } from "@/mail/core";
import { json, readJson, route } from "@/mail/server/http";

export const GET = route(async ({ c, session }) => json(await c.repos.settings.get(session.userId)));

export const PATCH = route(
  async ({ c, session, req }) => {
    const r = settingsPatchSchema.safeParse(await readJson(req));
    if (!r.success) throw new MailError("INVALID_INPUT", firstIssueMessage(r.error));
    return json(await c.repos.settings.update(session.userId, r.data));
  },
  { mutating: true },
);
