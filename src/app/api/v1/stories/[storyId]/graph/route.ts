import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { getGraph } from "@/features/graph/services/graph-service";

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
    const graph = await getGraph(supabase, storyId);
    if (!graph) {
      return apiError(ErrorCode.STORY_NOT_FOUND, "Story not found.");
    }
    return apiSuccess(graph);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load graph.");
  }
}
