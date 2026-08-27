"use client";

import { useActionState, useState } from "react";
import { createStoryAction } from "@/features/story/actions";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<null> | null = null;

export function CreateStoryModal({ workspaceId }: { workspaceId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [state, formAction, isPending] = useActionState(
    createStoryAction,
    initialState,
  );

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        + New Story
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 px-4">
          <div className="w-full max-w-md rounded-lg bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h2 className="text-lg font-semibold text-gray-900">
                New Story
              </h2>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                aria-label="Close"
                className="text-gray-400 hover:text-gray-600"
              >
                ×
              </button>
            </div>

            <form action={formAction} className="flex flex-col gap-4">
              <input type="hidden" name="workspaceId" value={workspaceId} />

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="title"
                  className="text-sm font-medium text-gray-700"
                >
                  Title *
                </label>
                <input
                  id="title"
                  name="title"
                  type="text"
                  required
                  maxLength={200}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="description"
                  className="text-sm font-medium text-gray-700"
                >
                  Description
                </label>
                <textarea
                  id="description"
                  name="description"
                  rows={2}
                  maxLength={5000}
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="startState"
                  className="text-sm font-medium text-gray-700"
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
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>

              <div className="flex flex-col gap-1">
                <label
                  htmlFor="goalState"
                  className="text-sm font-medium text-gray-700"
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
                  className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
                />
              </div>

              {state && !state.success && (
                <p role="alert" className="text-sm text-red-600">
                  {state.error.message}
                </p>
              )}

              <div className="flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="rounded-md px-4 py-2 text-sm font-medium text-gray-600"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                >
                  {isPending ? "Creating..." : "Create"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </>
  );
}
