import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { updateStorySchema } from "@/lib/validation/story";
import * as storyRepository from "@/repositories/story.repository";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { storyId } = await params;

  try {
    const story = await storyRepository.findById(supabase, storyId);
    if (!story) {
      // RLS-filtered rows and truly missing rows look identical here on
      // purpose (Section 88: don't leak existence to an unauthorized caller).
      return apiError(ErrorCode.STORY_NOT_FOUND, "Story not found.");
    }
    return apiSuccess(story);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load story.");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { storyId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateStorySchema.safeParse({ storyId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const { storyId: id, ...patch } = parsed.data;
    const story = await storyRepository.updateStory(supabase, id, patch);
    return apiSuccess(story);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to update story.");
  }
}

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { storyId } = await params;

  try {
    await storyRepository.deleteStory(supabase, storyId);
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to delete story.");
  }
}
