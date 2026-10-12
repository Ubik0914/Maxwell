import { MailError } from "@/mail/core";
import { json, route } from "@/mail/server/http";

/** 本人のアカウントだけを同期する（30秒に1回程度に制限） */
export const POST = route(
  async ({ c, session }) => {
    const account = await c.core.mail.resolveAccount(session);
    const r = await c.core.sync.syncAccount(account.id, "manual");
    if (r.outcome === "reauth_required") throw new MailError("REAUTH_REQUIRED");
    return json({ outcome: r.outcome, newMessages: r.newMessages });
  },
  { mutating: true, rateLimit: "sync" },
);
