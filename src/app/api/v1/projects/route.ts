import type { NextRequest } from "next/server";
import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import { createProjectSchema } from "@/lib/validation/project";
import * as projectRepository from "@/repositories/project.repository";

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
    const projects = await projectRepository.listProjectsForWorkspace(
      supabase,
      workspaceId,
    );
    return apiSuccess(projects);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load projects.");
  }
}

export async function POST(request: NextRequest) {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  const body = await request.json().catch(() => null);
  const parsed = createProjectSchema.safeParse(body);
  if (!parsed.success) {
    return apiError(
      ErrorCode.VALIDATION_ERROR,
      parsed.error.issues[0]?.message ?? "Invalid input",
    );
  }

  try {
    const id = await projectRepository.createProject(supabase, {
      ...parsed.data,
      createdBy: user.id,
    });
    return apiSuccess({ id }, 201);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to create project.");
  }
}
