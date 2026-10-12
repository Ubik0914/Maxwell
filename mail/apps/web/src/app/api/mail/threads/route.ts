import { json, route, searchParamsObject } from "@/server/http";

export const GET = route(async ({ c, session, req }) => json(await c.core.mail.listInbox(session, searchParamsObject(req))));
