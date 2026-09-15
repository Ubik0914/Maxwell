import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { createStorySchema } from "@/lib/validation/story";
import * as storyRepository from "@/repositories/story.repository";

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

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

  // `projectId=none` asks for the stories on no shelf. It is a word
  // rather than an empty string because an absent parameter and an
  // empty one are the same thing in a query string, and these two
  // questions are not the same question.
  const projectId = request.nextUrl.searchParams.get("projectId");
  if (projectId !== null && projectId !== "none" && !UUID.test(projectId)) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      "projectId must be a UUID or 'none'.",
    );
  }

  try {
    const stories = await storyRepository.listStoriesForWorkspace(
      supabase,
      workspaceId,
      projectId === null
        ? {}
        : { projectId: projectId === "none" ? null : projectId },
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
