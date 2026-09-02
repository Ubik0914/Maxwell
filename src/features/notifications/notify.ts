import { after } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "@/types/database";
import type { GraphNode } from "@/domain/graph/types";
import * as storyRepository from "@/repositories/story.repository";
import {
  completedMessage,
  unblockedMessage,
  type PushMessage,
} from "@/features/notifications/messages";
import { sendToUser } from "@/features/notifications/send";

type Client = SupabaseClient<Database, "dag">;

export interface StatusChangeNotice {
  /** Who made the change, and so whose devices are told about it. */
  userId: string;
  storyId: string;
  /** What changeTaskStatus recalculated, demotions and all. */
  affected: GraphNode[];
  /** True only on the change that finished the story. */
  completed: boolean;
}

/**
 * Tells whoever made this change what it set free, on whatever devices
 * they asked to be told on.
 *
 * Called from the Status Engine rather than from the two routes that
 * reach it, so a status change notifies whichever door it came in
 * through — the board, the CLI, an agent working the graph over MCP.
 * That last one is the case worth having: an agent marking work done
 * while nobody is watching is exactly when a phone should be told
 * something came free.
 *
 * Who that is comes in as an argument rather than being asked for
 * here. A request carrying a bearer token has no session for
 * `auth.getUser()` to find — that is exactly how the CLI and the MCP
 * server arrive — and the routes have already resolved the caller
 * either way.
 *
 * Everything happens in `after`, once the response has gone. A push
 * costs a round trip to Google or Apple per device, and the person
 * waiting on the status change should not wait for it. It also means
 * nothing here can turn a successful change into a failed request,
 * which is why every error is swallowed: the notification is a courtesy
 * on top of work that has already been committed, and there is nobody
 * left to report it to.
 */
export function notifyStatusChange(
  supabase: Client,
  { userId, storyId, affected, completed }: StatusChangeNotice,
): void {
  // The cheap check first, in the request, so the common change — one
  // task moved, nothing unblocked — schedules nothing at all.
  if (!completed && !affected.some((node) => node.status === "READY")) return;

  try {
    after(async () => {
      try {
        const story = await storyRepository.findById(supabase, storyId);
        if (!story) return;

        const message: PushMessage | null = completed
          ? completedMessage(story)
          : unblockedMessage(story, affected);
        if (!message) return;

        await sendToUser(supabase, userId, message);
      } catch {
        // Nothing to do about it and nobody to tell: see above.
      }
    });
  } catch {
    // `after` needs a request to be after. Anything calling the Status
    // Engine from outside one still gets its status change; it just
    // does not get to notify.
  }
}
