"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  deleteWorkspaceAction,
  switchWorkspaceAction,
} from "@/features/workspace/actions";
import type { WorkspaceMembership } from "@/repositories/workspace.repository";
import { DeleteWorkspaceDialog } from "@/components/workspace/DeleteWorkspaceDialog";
import { Menu, type MenuItemSpec } from "@/components/ui/Menu";
import { useToast } from "@/components/Toast";
import type { PressPoint } from "@/hooks/useLongPress";
import { MoreIcon, TrashIcon } from "@/components/icons";

/**
 * One workspace: the thing you press to go there, and — if it is yours
 * to end — a way to end it.
 *
 * Built like a story in the drawer, because it is the same kind of row
 * doing the same job: a dot saying which one you are in, a name, a line
 * of what it holds, and everything else behind the "⋮". It used to be a
 * bordered card with a trash can bolted to its side, which was the only
 * place in the app where a destructive action sat out in the open next
 * to the thing it destroys.
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
  isCurrent,
  onDeleted,
}: {
  membership: WorkspaceMembership;
  isCurrent: boolean;
  onDeleted: () => void;
}) {
  const { showError } = useToast();
  const [isConfirmOpen, setIsConfirmOpen] = useState(false);
  const [menuAt, setMenuAt] = useState<PressPoint | null>(null);
  const [isPending, startTransition] = useTransition();
  const moreRef = useRef<HTMLButtonElement>(null);

  const items: MenuItemSpec[] = [
    {
      key: "delete",
      label: "Delete workspace…",
      icon: <TrashIcon className="h-3.5 w-3.5" />,
      danger: true,
      onSelect: () => setIsConfirmOpen(true),
    },
  ];

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
    <div
      className={`rounded-lg transition-colors ${
        isCurrent ? "bg-accent-soft" : "hover:bg-surface-hover"
      }`}
    >
      <div className="flex items-start gap-1 pr-1.5">
        <form
          action={switchWorkspaceAction.bind(null, membership.workspaceId)}
          className="min-w-0 flex-1"
        >
          <button
            type="submit"
            aria-current={isCurrent ? "page" : undefined}
            title={membership.name}
            className="flex w-full min-w-0 flex-col items-start gap-1.5 py-2.5 pl-3 text-left"
          >
            <span className="flex w-full items-center gap-2">
              <span
                aria-hidden="true"
                className={`h-1.5 w-1.5 shrink-0 rounded-full bg-current ${
                  isCurrent ? "text-accent" : "text-text-faint"
                }`}
              />
              <span
                className={`min-w-0 truncate text-sm ${
                  isCurrent ? "text-accent" : "text-text"
                }`}
              >
                {membership.name}
              </span>
            </span>

            <span className="flex w-full flex-wrap items-baseline gap-x-2.5 gap-y-1 pl-3.5">
              <span className="text-[10px] tracking-[0.12em] text-text-faint uppercase">
                {membership.role}
              </span>
              <span
                aria-hidden="true"
                className="text-[10px] text-text-faint"
              >
                ·
              </span>
              <span className="flex items-baseline gap-0.5">
                <span
                  className={`text-xs leading-none font-semibold tabular-nums ${
                    membership.storyCount > 0 ? "text-accent" : "text-text-faint"
                  }`}
                >
                  {membership.storyCount}
                </span>
                <span className="text-[10px] tracking-[0.1em] text-text-faint uppercase">
                  {membership.storyCount === 1 ? "Story" : "Stories"}
                </span>
              </span>

              {/* The one row you are already in says so, rather than
                  leaving the accent to be read as decoration. */}
              {isCurrent && (
                <span className="ml-auto shrink-0 text-[10px] tracking-[0.12em] text-accent uppercase">
                  Current
                </span>
              )}
            </span>
          </button>
        </form>

        {membership.role === "OWNER" && (
          <button
            ref={moreRef}
            type="button"
            // Opened under its own corner rather than at the pointer:
            // this is a button, not a whole row, so there is a corner to
            // open from and a keyboard press has no point to use.
            onClick={() => {
              const box = moreRef.current?.getBoundingClientRect();
              setMenuAt({ x: box?.left ?? 0, y: box?.bottom ?? 0 });
            }}
            aria-haspopup="menu"
            aria-expanded={menuAt !== null}
            aria-label={`Actions for ${membership.name}`}
            title="More"
            className="mt-2.5 shrink-0 rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <MoreIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {menuAt && (
        <Menu at={menuAt} items={items} onClose={() => setMenuAt(null)} />
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
  currentWorkspaceId,
}: {
  memberships: WorkspaceMembership[];
  /** Which one the workspace_id cookie currently points at, if any. */
  currentWorkspaceId?: string;
}) {
  const router = useRouter();

  return (
    <ul className="flex flex-col gap-0.5">
      {memberships.map((membership) => (
        <li key={membership.workspaceId}>
          <WorkspaceRow
            membership={membership}
            isCurrent={membership.workspaceId === currentWorkspaceId}
            // The page is a server component and the list it rendered is
            // now wrong by one row.
            onDeleted={() => router.refresh()}
          />
        </li>
      ))}
    </ul>
  );
}
