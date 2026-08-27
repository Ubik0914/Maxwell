import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Resolves the signed-in user and their current workspace for a request.
 * The workspace_id cookie is only a hint — RLS (via the workspaces SELECT
 * policy) is what actually decides whether the row is visible, so a stale
 * or forged cookie value simply falls through to /workspaces.
 */
export async function requireCurrentWorkspace() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const cookieStore = await cookies();
  const workspaceId = cookieStore.get("workspace_id")?.value;

  if (!workspaceId) {
    redirect("/workspaces");
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .maybeSingle();

  if (!workspace) {
    redirect("/workspaces");
  }

  return { user, workspace, supabase };
}
