"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteWorkspaceAction,
  switchWorkspaceAction,
} from "@/features/workspace/actions";
import type { WorkspaceMembership } from "@/repositories/workspace.repository";
import { DeleteWorkspaceDialog } from "@/components/workspace/DeleteWorkspaceDialog";
import { useToast } from "@/components/Toast";
import { TrashIcon } from "@/components/icons";

/**
 * One workspace: the thing you press to go there, and — if it is yours
 * to end — a way to end it.
 *
 * A frame holding a form and a button rather than a button inside the
 * form: a nested button submits the form it is standing in, so the two
 * would be one control fighting over one press, and the losing side is
 * the destructive one.
 *
 * Delete is shown to owners only. The database decides that too (see
 * the workspaces_delete policy), so this is not what keeps anybody out
 * — it is what keeps a control that would only ever fail off the screen
 * of everybody it would fail for.
 */
function WorkspaceRow({
  membership,
  onDeleted,
}: {
  membership: WorkspaceMembership;
  onDeleted: () => void;
}) {
  const { showError } = useToast();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteWorkspaceAction(membership.workspaceId);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      setIsConfirmOpen(false);
      onDeleted();
    });
  }

  return (
    <div className="flex items-stretch gap-2">
      <form
        action={switchWorkspaceAction.bind(null, membership.workspaceId)}
        className="min-w-0 flex-1"
      >
        <button
          type="submit"
          className="flex w-full flex-col items-start gap-1 rounded-lg border border-border bg-surface px-4 py-3 text-left transition hover:border-accent"
        >
          <span className="w-full truncate font-medium text-text">
            {membership.name}
          </span>
          <span className="text-xs tracking-wide text-text-faint uppercase">
            {membership.role} ·{" "}
            {membership.storyCount === 1
              ? "1 story"
              : `${membership.storyCount} stories`}
          </span>
        </button>
      </form>

      {membership.role === "OWNER" && (
        <button
          type="button"
          onClick={() => setIsConfirmOpen(true)}
          aria-label={`Delete ${membership.name}`}
          title="Delete workspace"
          className="shrink-0 rounded-lg border border-border px-3 text-text-faint transition-colors hover:border-danger/40 hover:bg-danger-soft hover:text-danger"
        >
          <TrashIcon />
        </button>
      )}

      {isConfirmOpen && (
        <DeleteWorkspaceDialog
          name={membership.name}
          storyCount={membership.storyCount}
          isPending={isPending}
          onConfirm={handleDelete}
          onCancel={() => setIsConfirmOpen(false)}
        />
      )}
    </div>
  );
}

export function WorkspaceList({
  memberships,
}: {
  memberships: WorkspaceMembership[];
}) {
  const router = useRouter();

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
          <WorkspaceRow
            membership={membership}
            // The page is a server component and the list it rendered is
            // now wrong by one row.
            onDeleted={() => router.refresh()}
          />
        </li>
      ))}
    </ul>
  );
}
