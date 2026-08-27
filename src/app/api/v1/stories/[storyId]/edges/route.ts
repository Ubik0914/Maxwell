import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { createEdgeSchema } from "@/lib/validation/edge";
import * as graphService from "@/features/graph/services/graph-service";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ storyId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { storyId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = createEdgeSchema.safeParse({ storyId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const result = await graphService.connectNodes(supabase, parsed.data);
    if (!result.success) {
      return apiError(result.error.code, result.error.message);
    }
    return apiSuccess({ id: result.edge.id }, 201);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to connect tasks.");
  }
}
