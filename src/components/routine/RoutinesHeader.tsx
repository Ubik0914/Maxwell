import { MenuButton } from "@/components/layout/MenuButton";

/**
 * The routines screen's top bar.
 *
 * A story's header carries three views and a set of tallies because a
 * story can be read three ways and its numbers move. Routines have one
 * shape and one question, so this is the drawer, the name, and the
 * count — anything more would be chrome standing in for content.
 */
export function RoutinesHeader({
  workspace,
  userEmail,
  count,
}: {
  workspace: { id: string; name: string };
  userEmail: string;
  count: number;
}) {
  return (
    <header className="z-10 flex shrink-0 items-center gap-2.5 border-b border-border bg-bg px-3 py-2 sm:px-5">
      <MenuButton
        workspaceId={workspace.id}
        workspaceName={workspace.name}
        userEmail={userEmail}
        className="-ml-1.5 shrink-0"
      />
      <h1 className="min-w-0 flex-1 truncate text-sm font-semibold text-text sm:text-base">
        Routines
      </h1>
      <span className="shrink-0 text-[10px] font-semibold tracking-[0.14em] text-text-faint uppercase">
        {count} {count === 1 ? "routine" : "routines"}
      </span>
    </header>
  );
}
