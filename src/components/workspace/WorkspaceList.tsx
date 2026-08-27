import { switchWorkspaceAction } from "@/features/workspace/actions";
import type { WorkspaceMembership } from "@/repositories/workspace.repository";

export function WorkspaceList({
  memberships,
}: {
  memberships: WorkspaceMembership[];
}) {
  if (memberships.length === 0) {
    return (
      <p className="text-sm text-text-faint">
        You don&apos;t belong to any workspace yet.
      </p>
    );
  }

  return (
    <ul className="flex flex-col gap-3">
      {memberships.map((membership) => (
        <li key={membership.workspaceId}>
          <form
            action={switchWorkspaceAction.bind(null, membership.workspaceId)}
          >
            <button
              type="submit"
              className="flex w-full flex-col items-start gap-1 rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:border-accent"
            >
              <span className="font-medium text-text">
                {membership.name}
              </span>
              <span className="text-xs uppercase tracking-wide text-text-faint">
                {membership.role}
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
