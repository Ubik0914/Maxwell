"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createStorySchema, updateStorySchema } from "@/lib/validation/story";
import { ErrorCode } from "@/lib/errors/codes";
import * as storyRepository from "@/repositories/story.repository";
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
