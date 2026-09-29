import { AppShell } from "@/components/layout/AppShell";
import { Skeleton } from "@/components/Skeleton";
import { SectionLabel } from "@/components/ui/SectionLabel";

/**
 * Reached from the workspace name in the drawer, so it has the same
 * frozen-screen problem the story list had — the shell, the heading and
 * the layout are real from the first frame, the rows fill in.
 *
 * The shell is the same one the page renders, with nothing said about
 * the workspace yet: undefined rather than null, so the header shows a
 * placeholder for a name that is on its way instead of the blank that
 * means there is none.
 */
export default function WorkspacesLoading() {
  return (
    <AppShell>
      <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-2 py-6 sm:px-4">
        <div className="px-3">
          <SectionLabel>Workspaces</SectionLabel>
        </div>

        <div className="flex flex-col gap-0.5">
          {[0, 1].map((row) => (
            <div key={row} className="flex flex-col gap-1.5 px-3 py-2.5">
              <Skeleton className="h-3.5 w-40" />
              <Skeleton className="ml-3.5 h-3 w-28" />
            </div>
          ))}
        </div>
      </div>
    </AppShell>
  );
}
