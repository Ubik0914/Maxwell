import { json, route } from "@/mail/server/http";

export const GET = route<{ threadId: string }>(async ({ c, session, req }, { threadId }) =>
  json(await c.core.mail.getThread(session, threadId, { allowRemoteImages: req.nextUrl.searchParams.get("images") === "1" })),
);
