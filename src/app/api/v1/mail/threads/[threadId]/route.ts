import { threadForAgent, threadInput } from "@/mail/server/agent";
import { searchParamsObject } from "@/mail/server/http";
import { parseInput, v1Route } from "@/mail/server/v1";

/** GET /api/v1/mail/threads/:id?for_summary=1&max_messages=&max_chars_per_message= — スレッドの本文（テキスト） */
export const GET = v1Route<{ threadId: string }>(async ({ req, c, session }, { threadId }) =>
  threadForAgent({ mail: c.core.mail, userId: session.userId }, parseInput(threadInput, { ...searchParamsObject(req), thread_id: threadId })),
);
