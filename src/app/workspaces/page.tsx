import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listWorkspacesForUser } from "@/repositories/workspace.repository";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";
import { CreateWorkspaceForm } from "@/components/workspace/CreateWorkspaceForm";

export default async function WorkspacesPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/login");
  }

  const memberships = await listWorkspacesForUser(supabase, user.id);

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col gap-6 bg-bg px-4 py-12">
      <h1 className="text-2xl font-semibold text-text">Your Workspaces</h1>
      <WorkspaceList memberships={memberships} />
      <CreateWorkspaceForm />
    </main>
  );
}
