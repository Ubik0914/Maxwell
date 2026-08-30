import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { createTaskSchema } from "@/lib/validation/task";
import { nextFreeSpot } from "@/domain/graph/layout";
import * as nodeRepository from "@/repositories/node.repository";

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
  const parsed = createTaskSchema.safeParse({ storyId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    // A caller with no canvas doesn't say where; the graph decides.
    const position =
      parsed.data.position ??
      nextFreeSpot(await nodeRepository.findByStoryId(supabase, storyId));

    const node = await nodeRepository.createTask(supabase, {
      storyId: parsed.data.storyId,
      title: parsed.data.title,
      description: parsed.data.description,
      positionX: position.x,
      positionY: position.y,
    });
    return apiSuccess({ id: node.id, status: node.status }, 201);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to create task.");
  }
}
