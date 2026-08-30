"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createWorkspaceSchema } from "@/lib/validation/workspace";
import { ErrorCode } from "@/lib/errors/codes";
import { deleteTaskImages } from "@/features/attachments/cleanup";
import * as workspaceRepository from "@/repositories/workspace.repository";
import type { ActionResult } from "@/types/action-result";

const WORKSPACE_COOKIE = "workspace_id";
const WORKSPACE_COOKIE_OPTIONS = {
  httpOnly: true,
  sameSite: "lax" as const,
  path: "/",
};

export async function createWorkspaceAction(
  _prevState: ActionResult<{ workspaceId: string }> | null,
  formData: FormData,
): Promise<ActionResult<{ workspaceId: string }>> {
  const parsed = createWorkspaceSchema.safeParse({
    name: formData.get("name"),
  });

  if (!parsed.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsed.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  let workspaceId: string;
  try {
    const workspace = await workspaceRepository.createWorkspace(supabase, {
      name: parsed.data.name,
      createdBy: user.id,
    });
    await workspaceRepository.addWorkspaceMember(supabase, {
      workspaceId: workspace.id,
      userId: user.id,
      role: "OWNER",
    });
    workspaceId = workspace.id;
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to create workspace. Please try again.",
      },
    };
  }

  const cookieStore = await cookies();
  cookieStore.set(WORKSPACE_COOKIE, workspaceId, WORKSPACE_COOKIE_OPTIONS);

  redirect("/stories");
}

/**
 * Removes a workspace, and everything that only existed inside it.
 *
 * The order matters. Pictures are cleared first, while the stories that
 * authorise reaching them still exist — afterwards the bucket's
 * policies have no workspace to check membership against and the files
 * are beyond anyone's reach forever (see deleteTaskImages).
 *
 * Whether this is allowed at all is the database's answer, not this
 * function's: the workspaces_delete policy admits owners only. What is
 * checked here is that it happened, because a policy that refuses does
 * so by matching no rows rather than by failing.
 */
export async function deleteWorkspaceAction(
  workspaceId: string,
): Promise<ActionResult<null>> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return {
      success: false,
      error: { code: ErrorCode.AUTH_REQUIRED, message: "Please log in." },
    };
  }

  try {
    const storyIds = await workspaceRepository.listStoryIds(
      supabase,
      workspaceId,
    );
    await deleteTaskImages(supabase, storyIds);

    const deleted = await workspaceRepository.deleteWorkspace(
      supabase,
      workspaceId,
    );

    if (!deleted) {
      return {
        success: false,
        error: {
          code: ErrorCode.WORKSPACE_FORBIDDEN,
          message: "Only the workspace owner can delete it.",
        },
      };
    }
  } catch {
    return {
      success: false,
      error: {
        code: ErrorCode.INTERNAL_ERROR,
        message: "Failed to delete workspace. Please try again.",
      },
    };
  }

  // The cookie is only a hint and a stale one falls through to
  // /workspaces anyway, but leaving it pointing at something deleted
  // means a redirect on the next page instead of a page.
  const cookieStore = await cookies();
  if (cookieStore.get(WORKSPACE_COOKIE)?.value === workspaceId) {
    cookieStore.delete(WORKSPACE_COOKIE);
  }

  return { success: true, data: null };
}

export async function switchWorkspaceAction(
  workspaceId: string,
): Promise<void> {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const isMember = await workspaceRepository.isWorkspaceMember(
    supabase,
    workspaceId,
    user.id,
  );

  if (isMember) {
    const cookieStore = await cookies();
    cookieStore.set(WORKSPACE_COOKIE, workspaceId, WORKSPACE_COOKIE_OPTIONS);
  }

  redirect("/stories");
}
