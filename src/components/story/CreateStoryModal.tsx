"use client";

import { useActionState, useState } from "react";
import { createStoryAction } from "@/features/story/actions";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<null> | null = null;

export function CreateStoryModal({ workspaceId }: { workspaceId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createStoryAction,
    initialState,
  );
  useEscapeKey(() => setIsOpen(false), isOpen);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover"
      >
        + New Story
      </button>

      {isOpen && (
        <Modal
          title="New Story"
          subtitle="Define where the path starts and where it has to end."
          onClose={() => setIsOpen(false)}
        >
          <form action={formAction} className="flex flex-col gap-4">
            <input type="hidden" name="workspaceId" value={workspaceId} />

            <div className="flex flex-col gap-1">
              <label
                htmlFor="title"
                className="text-sm font-medium text-text-muted"
              >
                Title *
              </label>
              <input
                id="title"
                name="title"
                type="text"
                required
                autoFocus
                maxLength={200}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="description"
                className="text-sm font-medium text-text-muted"
              >
                Description
              </label>
              <textarea
                id="description"
                name="description"
                rows={2}
                maxLength={5000}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="startState"
                className="text-sm font-medium text-text-muted"
              >
                Start State *
              </label>
              <input
                id="startState"
                name="startState"
                type="text"
                required
                maxLength={200}
                placeholder="e.g. Requirements approved"
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="goalState"
                className="text-sm font-medium text-text-muted"
              >
                Goal State *
              </label>
              <input
                id="goalState"
                name="goalState"
                type="text"
                required
                maxLength={200}
                placeholder="e.g. Available in production"
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
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
                onClick={() => setIsOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent-hover disabled:opacity-50"
              >
                {isPending && <Spinner />}
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
