"use server";

import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { createWorkspaceSchema } from "@/lib/validation/workspace";
import { ErrorCode } from "@/lib/errors/codes";
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
