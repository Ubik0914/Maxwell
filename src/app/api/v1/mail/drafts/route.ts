import { readJson } from "@/mail/server/http";
import { draftInput, saveDraftForAgent } from "@/mail/server/agent";
import { parseInput, v1Route } from "@/mail/server/v1";

/** POST /api/v1/mail/drafts { to, cc, bcc, subject, body, reply_to_message_id? } — Gmail の下書きに保存する（送信はしない） */
export const POST = v1Route(
  async ({ req, c, session }) =>
    saveDraftForAgent({ mail: c.core.mail, userId: session.userId }, parseInput(draftInput, await readJson(req, 256 * 1024))),
  { mutating: true },
);
