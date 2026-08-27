import { requireCurrentWorkspace } from "@/features/workspace/current-workspace";
import { listStoriesForWorkspace } from "@/repositories/story.repository";
import { AppShell } from "@/components/layout/AppShell";
import { StoryList } from "@/components/story/StoryList";
import { StatusFilter } from "@/components/story/StatusFilter";

type StatusFilterValue = "ALL" | "ACTIVE" | "COMPLETED" | "ARCHIVED";

function parseStatusFilter(value: string | undefined): StatusFilterValue {
  if (value === "ACTIVE" || value === "COMPLETED" || value === "ARCHIVED") {
    return value;
  }
  return "ALL";
}

export default async function StoriesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  const { user, workspace, supabase } = await requireCurrentWorkspace();
  const { status } = await searchParams;
  const filter = parseStatusFilter(status);

  const stories = await listStoriesForWorkspace(supabase, workspace.id);
  const filteredStories =
    filter === "ALL" ? stories : stories.filter((s) => s.status === filter);

  return (
    <AppShell workspaceName={workspace.name} userEmail={user.email ?? ""}>
      <div className="flex flex-col gap-6 p-8">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold text-gray-900">Stories</h1>
        </div>
        <StatusFilter current={filter} />
        <StoryList stories={filteredStories} />
      </div>
    </AppShell>
  );
}
