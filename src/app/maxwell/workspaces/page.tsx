import { getCurrentWorkspace } from "@/features/workspace/current-workspace";
import { listWorkspacesForUser } from "@/repositories/workspace.repository";
import { AppShell } from "@/components/layout/AppShell";
import { WorkspaceScreen } from "@/components/workspace/WorkspaceScreen";

/**
 * Where you switch workspace, and where a new account starts.
 *
 * Inside the app's shell like every other signed-in screen. It stood
 * outside it for a long time — no top bar, no drawer, no way back to
 * the story you came from — which made a switch that is really one
 * press feel like leaving the product.
 *
 * getCurrentWorkspace rather than requireCurrentWorkspace, because this
 * is the page that one redirects to: asking it for a workspace here
 * would send anyone without one round in a circle. Not being in one is
 * exactly the state this screen is for, and it is handed to the chrome
 * as `null` so the header and the drawer say so instead of holding a
 * placeholder open forever.
 */
export default async function WorkspacesPage() {
  const { user, workspace, supabase } = await getCurrentWorkspace();
  const memberships = await listWorkspacesForUser(supabase, user.id);

  return (
    <AppShell
      workspaceId={workspace?.id}
      workspaceName={workspace?.name ?? null}
      userEmail={user.email ?? ""}
    >
      <WorkspaceScreen
        memberships={memberships}
        currentWorkspaceId={workspace?.id}
      />
    </AppShell>
  );
}
