import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * The signed-in user, and the workspace they are currently in if they
 * are in one.
 *
 * The workspace_id cookie is only a hint — RLS (via the workspaces
 * SELECT policy) is what actually decides whether the row is visible, so
 * a stale or forged cookie value simply reads as "no current workspace".
 *
 * This is the form the workspaces screen needs, and it is the reason it
 * exists separately: that screen is where requireCurrentWorkspace sends
 * everyone who has no workspace, so it is the one page that cannot ask
 * to be redirected there. It renders the app's chrome around a
 * workspace that may not exist yet instead.
 */
export async function getCurrentWorkspace() {
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
    return { user, workspace: null, supabase };
  }

  const { data: workspace } = await supabase
    .from("workspaces")
    .select("id, name")
    .eq("id", workspaceId)
    .maybeSingle();

  return { user, workspace: workspace ?? null, supabase };
}

/**
 * The same, for the pages that have nothing to show without a workspace.
 * Not being in one is not an error here — it is the workspaces screen's
 * business, so that is where it goes.
 */
export async function requireCurrentWorkspace() {
  const { user, workspace, supabase } = await getCurrentWorkspace();

  if (!workspace) {
    redirect("/workspaces");
  }

  return { user, workspace, supabase };
}
