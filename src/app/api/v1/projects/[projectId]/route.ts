import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { updateProjectSchema } from "@/lib/validation/project";
import * as projectRepository from "@/repositories/project.repository";

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { projectId } = await params;

  try {
    const project = await projectRepository.findById(supabase, projectId);
    if (!project) {
      // Filtered by RLS and genuinely absent look the same from here,
      // on purpose (Section 88).
      return apiError(ErrorCode.PROJECT_NOT_FOUND, "Project not found.");
    }
    return apiSuccess(project);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load project.");
  }
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { projectId } = await params;
  const body = await request.json().catch(() => null);
  const parsed = updateProjectSchema.safeParse({ projectId, ...body });
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const { projectId: id, ...patch } = parsed.data;
    const project = await projectRepository.updateProject(supabase, id, patch);
    return apiSuccess(project);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to update project.");
  }
}

/** The stories stay; only the shelf goes (see the migration's FK). */
export async function DELETE(
  _request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const { projectId } = await params;

  try {
    await projectRepository.deleteProject(supabase, projectId);
    return apiSuccess(null);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to delete project.");
  }
}
