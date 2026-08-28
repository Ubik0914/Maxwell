import { redirect } from "next/navigation";
import { requireCurrentWorkspace } from "@/features/workspace/current-workspace";
import { listStoryLinks } from "@/repositories/story.repository";
import { AppShell } from "@/components/layout/AppShell";
import { FirstStory } from "@/components/story/FirstStory";

/**
 * Not a screen any more — a doorway.
 *
 * There was a page of story cards here: filters, a grid, a New Story
 * button. It was somewhere you passed through on the way to the story
 * you wanted and then left again, which is a whole screen's worth of
 * chrome for a decision that is really only "which one". All of it is
 * in the drawer now, where it is reachable from inside a story instead
 * of instead of one.
 *
 * So this route sends you to the story you touched last, and the app is
 * always showing a story. It stays a route rather than disappearing
 * because everything that means "you are signed in and in a workspace"
 * — logging in, switching workspace, deleting the story you were in —
 * arrives here, and all of it should land somewhere you can work.
 *
 * With no stories there is nowhere to send anyone, and that is the one
 * time this renders: the empty state, which asks for the first one.
 */
export default async function StoriesPage() {
  const { user, workspace, supabase } = await requireCurrentWorkspace();
  const stories = await listStoryLinks(supabase, workspace.id);

  // Ordered by most recently touched, so the first is where you were.
  if (stories.length > 0) {
    redirect(`/stories/${stories[0].id}`);
  }

  return (
    <AppShell
      workspaceId={workspace.id}
      workspaceName={workspace.name}
      userEmail={user.email ?? ""}
    >
      <FirstStory workspaceId={workspace.id} />
    </AppShell>
  );
}
