import { searchForAgent, searchInput } from "@/mail/server/agent";
import { searchParamsObject } from "@/mail/server/http";
import { parseInput, v1Route } from "@/mail/server/v1";

/** GET /api/v1/mail/search?query=…&limit=&page_token= — Gmail 検索演算子でスレッドを探す（AI 向けの形） */
export const GET = v1Route(async ({ req, c, session }) =>
  searchForAgent({ mail: c.core.mail, userId: session.userId }, parseInput(searchInput, searchParamsObject(req))),
);
