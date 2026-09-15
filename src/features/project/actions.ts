"use server";

import { createClient } from "@/lib/supabase/server";
import {
  createProjectSchema,
  updateProjectSchema,
} from "@/lib/validation/project";
import { ErrorCode } from "@/lib/errors/codes";
import * as projectRepository from "@/repositories/project.repository";
import type { ActionResult } from "@/types/action-result";

async function requireUser() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  return { supabase, user };
}

function loggedOut() {
  return {
    success: false as const,
    error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
  };
}

/**
 * The projects the drawer groups its stories under.
 *
 * Fetched alongside the stories rather than folded into them: the
 * drawer needs the empty projects too, and a list of stories can only
 * ever name the projects that already have something on them.
 */
export async function listProjectsAction(
  workspaceId: string,
): Promise<ActionResult<projectRepository.ProjectListItem[]>> {
  const { supabase, user } = await requireUser();
  if (!user) return loggedOut();

  try {
    const projects = await projectRepository.listProjectsForWorkspace(
      supabase,
      workspaceId,
    );
    return { success: true, data: projects };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to load projects.",
      },
    };
  }
}

export async function createProjectAction(input: {
  workspaceId: string;
  name: string;
  description?: string;
}): Promise<ActionResult<{ id: string }>> {
  const parsed = createProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) return loggedOut();

  try {
    const id = await projectRepository.createProject(supabase, {
      ...parsed.data,
      createdBy: user.id,
    });
    return { success: true, data: { id } };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to create project.",
      },
    };
  }
}

export async function updateProjectAction(input: {
  projectId: string;
  name?: string;
  description?: string | null;
  archived?: boolean;
}): Promise<ActionResult<projectRepository.ProjectDetail>> {
  const parsed = updateProjectSchema.safeParse(input);
  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const { supabase, user } = await requireUser();
  if (!user) return loggedOut();

  const { projectId, ...patch } = parsed.data;

  try {
    const project = await projectRepository.updateProject(
      supabase,
      projectId,
      patch,
    );
    return { success: true, data: project };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to save project.",
      },
    };
  }
}

/**
 * Removes the project. Its stories stay where they are, unfiled.
 *
 * No typed confirmation on the way in, unlike deleting a workspace:
 * nothing is lost here that cannot be put back by making the project
 * again and refiling.
 */
export async function deleteProjectAction(
  projectId: string,
): Promise<ActionResult<null>> {
  const { supabase, user } = await requireUser();
  if (!user) return loggedOut();

  try {
    await projectRepository.deleteProject(supabase, projectId);
    return { success: true, data: null };
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to delete project.",
      },
    };
  }
}
