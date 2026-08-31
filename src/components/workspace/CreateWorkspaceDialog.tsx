"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "@/features/workspace/actions";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<{ workspaceId: string }> | null = null;

/**
 * Asking for a new workspace, in the shape this app asks for anything:
 * a window over what you were looking at.
 *
 * It was a dashed-outline form pinned under the list, permanently
 * open — a field and a button for the thing you do once, sitting below
 * the thing you came here for every time you came. New Story is one
 * press and a dialog; this is the same decision, so it is the same
 * shape.
 *
 * Escape is taken exclusively: this can be opened from the workspaces
 * screen with the drawer behind it, and one press should put away one
 * thing.
 */
export function CreateWorkspaceDialog({ onClose }: { onClose: () => void }) {
  const [state, formAction, isPending] = useActionState(
    createWorkspaceAction,
    initialState,
  );
  useEscapeKey(onClose, true, { exclusive: true });

  return (
    <Modal
      title="New Workspace"
      subtitle="A place of its own for a set of stories, and the people in them."
      onClose={onClose}
    >
      <form action={formAction} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label htmlFor="name" className="text-sm font-medium text-text-muted">
            Name *
          </label>
          <input
            id="name"
            name="name"
            type="text"
            required
            autoFocus
            maxLength={100}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text transition-colors focus:border-accent focus:outline-none"
          />
        </div>

        {state && !state.success && (
          <p role="alert" className="text-sm text-danger select-text">
            {state.error.message}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending && <Spinner />}
            Create
          </button>
        </div>
      </form>
    </Modal>
  );
}
