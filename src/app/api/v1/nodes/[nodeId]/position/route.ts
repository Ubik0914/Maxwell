import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { updateNodePositionSchema } from "@/lib/validation/task";
import * as nodeRepository from "@/repositories/node.repository";

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ nodeId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { nodeId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateNodePositionSchema.safeParse({ nodeId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid position",
    );
  }

  try {
    await nodeRepository.updatePosition(
      supabase,
      parsed.data.nodeId,
      parsed.data.x,
      parsed.data.y,
    );
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to save position.");
  }
}
