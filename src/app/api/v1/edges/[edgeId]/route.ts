import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import * as graphService from "@/features/graph/services/graph-service";

export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ edgeId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { edgeId } = await params;

  try {
    await graphService.disconnectNodes(supabase, edgeId);
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to delete connection.");
  }
}
