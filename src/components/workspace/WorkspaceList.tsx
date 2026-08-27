import { switchWorkspaceAction } from "@/features/workspace/actions";
import type { WorkspaceMembership } from "@/repositories/workspace.repository";

export function WorkspaceList({
  memberships,
}: {
  memberships: WorkspaceMembership[];
}) {
  if (memberships.length === 0) {
    return (
      <p className="text-sm text-gray-500">
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
              className="flex w-full flex-col items-start gap-1 rounded-lg border border-gray-200 px-4 py-3 text-left transition hover:border-gray-400"
            >
              <span className="font-medium text-gray-900">
                {membership.name}
              </span>
              <span className="text-xs uppercase tracking-wide text-gray-500">
                {membership.role}
              </span>
            </button>
          </form>
        </li>
      ))}
    </ul>
  );
}
