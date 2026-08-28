import { requireApiUser } from "@/lib/api/auth";
import { apiSuccess, apiError } from "@/lib/api/response";
import { ErrorCode } from "@/lib/errors/codes";
import * as workspaceRepository from "@/repositories/workspace.repository";

/**
 * The caller's workspaces, with their role in each.
 *
 * The browser gets its current workspace from a cookie, so it never
 * needed this; a programmatic caller has no cookie and every other
 * endpoint wants a workspaceId, which made this the missing first step.
 */
export async function GET() {
  const { supabase, user } = await requireApiUser();
  if (!user) {
    return apiError(ErrorCode.AUTH_REQUIRED, "Authentication required.");
  }

  try {
    const memberships = await workspaceRepository.listWorkspacesForUser(
      supabase,
      user.id,
    );
    return apiSuccess(memberships);
  } catch {
    return apiError(ErrorCode.INTERNAL_ERROR, "Failed to load workspaces.");
  }
}
