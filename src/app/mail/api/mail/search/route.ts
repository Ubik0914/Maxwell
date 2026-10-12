import { json, route, searchParamsObject } from "@/mail/server/http";

export const GET = route(async ({ c, session, req }) => json(await c.core.mail.search(session, searchParamsObject(req))));
