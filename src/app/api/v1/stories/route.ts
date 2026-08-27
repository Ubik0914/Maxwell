import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { createStorySchema } from "@/lib/validation/story";
import * as storyRepository from "@/repositories/story.repository";

export async function GET(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const workspaceId = request.nextUrl.searchParams.get("workspaceId");
  if (!workspaceId) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      "workspaceId query parameter is required.",
    );
  }

  try {
    const stories = await storyRepository.listStoriesForWorkspace(
      supabase,
      workspaceId,
    );
    return apiSuccess(stories);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load stories.");
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createStorySchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const storyId = await storyRepository.createStory(supabase, parsed.data);
    return apiSuccess({ id: storyId }, 201);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to create story.");
  }
}
