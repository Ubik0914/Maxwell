"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createStorySchema, updateStorySchema } from "@/lib/validation/story";
import { ErrorCode } from "@/lib/errors/codes";
import * as storyRepository from "@/repositories/story.repository";
import * as nodeRepository from "@/repositories/node.repository";
import * as edgeRepository from "@/repositories/edge.repository";
import { calculateStoryStatus } from "@/domain/graph/story-status";
import type { ActionResult } from "@/types/action-result";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

export async function createStoryAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const description = formData.get("description");

  const parsed = createStorySchema.safeParse({
    workspaceId: formData.get("workspaceId"),
    title: formData.get("title"),
    description: description ? description : undefined,
    startState: formData.get("startState"),
    goalState: formData.get("goalState"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  let storyId: string;
  try {
    storyId = await storyRepository.createStory(supabase, parsed.data);
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to create story. Please try again.",
      },
    };
  }

  redirect(`/stories/${storyId}`);
}

export async function updateStoryAction(input: {
  storyId: string;
  title?: string;
  description?: string | null;
}): Promise<ActionResult<storyRepository.StoryDetail>> {
  const parsed = updateStorySchema.safeParse(input);

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  const { storyId, ...patch } = parsed.data;

  try {
    const story = await storyRepository.updateStory(supabase, storyId, patch);
    return { success: true, data: story };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to save story.",
      },
    };
  }
}

export async function archiveStoryAction(
  storyId: string,
): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    await storyRepository.archiveStory(supabase, storyId);
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to archive story.",
      },
    };
  }
}

/**
 * Takes a story back out of the archive.
 *
 * The restored status is re-derived from the graph rather than set to
 * ACTIVE, because ACTIVE/COMPLETED is not a thing anyone chooses — it
 * is what the DAG says. Archiving is the one manual override, so
 * lifting it should hand the story back to the rule that owns it,
 * otherwise a finished story would come back out claiming to be
 * unfinished.
 */
export async function unarchiveStoryAction(
  storyId: string,
): Promise<ActionResult<"ACTIVE" | "COMPLETED">> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    const [nodes, edges] = await Promise.all([
      nodeRepository.findByStoryId(supabase, storyId),
      edgeRepository.findByStoryId(supabase, storyId),
    ]);
    const status = calculateStoryStatus(nodes, edges);
    await storyRepository.updateStatus(supabase, storyId, status);
    return { success: true, data: status };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to restore story.",
      },
    };
  }
}

export async function deleteStoryAction(
  storyId: string,
): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    await storyRepository.deleteStory(supabase, storyId);
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to delete story.",
      },
    };
  }
}

export interface DrawerStories {
  stories: storyRepository.StoryListItem[];
  /**
   * When this answer was given, as an ISO timestamp.
   *
   * "Updated 3 hr ago" and "due today" are both measured from it,
   * rather than from the browser's clock: reading the clock while
   * rendering is impure, and the two would disagree anyway. It is a
   * snapshot taken when the drawer opened, which is what it looks
   * like.
   */
  now: string;
}

/**
 * The stories the drawer offers to switch to, and everything it says
 * about them.
 *
 * Fetched when the drawer opens rather than rendered into every page,
 * because a list of stories is only ever looked at by someone who has
 * just asked to go somewhere else — and every page that carried it
 * would pay a query for it whether or not it was ever opened. It is
 * also then always current, which a copy rendered at page load would
 * stop being the moment a story was renamed.
 *
 * This is the full record rather than a name and a state. The drawer
 * replaced a page of cards and inherited what that page was for:
 * seeing how far each story has got and settling the ones that are
 * done. A menu that only names them can switch between stories but
 * cannot manage them.
 *
 * The workspace is named by the caller: on a story page that is the
 * story's own workspace, which the cookie may disagree with after a
 * deep link. Nothing is trusted about it either way — RLS decides what
 * is visible, so an id that isn't yours simply returns nothing.
 */
export async function listStoriesAction(
  workspaceId: string,
): Promise<ActionResult<DrawerStories>> {
  const { supabase, user } = await requireUser();
  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    return {
      success: true,
      data: {
        stories: await storyRepository.listStoriesForWorkspace(
          supabase,
          workspaceId,
        ),
        now: new Date().toISOString(),
      },
    };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to load stories.",
      },
    };
  }
}
