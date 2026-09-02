import { requireCurrentWorkspace } from "@/features/workspace/current-workspace";
import { listRoutinesForWorkspace } from "@/repositories/routine.repository";
import { todayIso } from "@/app/stories/[storyId]/story-data";
import { RoutinesHeader } from "@/components/routine/RoutinesHeader";
import { RoutineList } from "@/components/routine/RoutineList";

/**
 * The repeating half of the workspace.
 *
 * It is a page of its own rather than a filter over the stories,
 * because a routine is not a task with a different label on it: it has
 * no dependencies, no GOAL, and a "done" that only means today. Those
 * differences are the whole reason it is here, and a tab inside a
 * story would have promised the opposite.
 *
 * The first copy is rendered against the server's UTC day and the
 * browser corrects it if it is having a different one — see useToday.
 */
export default async function RoutinesPage() {
  const { user, workspace, supabase } = await requireCurrentWorkspace();
  const today = todayIso();
  const routines = await listRoutinesForWorkspace(
    supabase,
    workspace.id,
    today,
  );

  return (
    <div className="flex h-dvh flex-col overflow-hidden bg-bg">
      <RoutinesHeader
        workspace={workspace}
        userEmail={user.email ?? ""}
        count={routines.length}
      />
      <div className="min-h-0 flex-1 overflow-y-auto">
        <RoutineList
          workspaceId={workspace.id}
          initialRoutines={routines}
          serverToday={today}
        />
      </div>
    </div>
  );
}
