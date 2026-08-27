"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createStorySchema } from "@/lib/validation/story";
import { ErrorCode } from "@/lib/errors/codes";
import * as storyRepository from "@/repositories/story.repository";
import type { ActionResult } from "@/types/action-result";

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
