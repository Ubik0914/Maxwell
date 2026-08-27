"use client";

import { useActionState } from "react";
import { createWorkspaceAction } from "@/features/workspace/actions";
import { Spinner } from "@/components/Spinner";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<{ workspaceId: string }> | null = null;

export function CreateWorkspaceForm() {
  const [state, formAction, isPending] = useActionState(
    createWorkspaceAction,
    initialState,
  );

  return (
    <form
      action={formAction}
      className="flex flex-col gap-2 rounded-lg border border-dashed border-gray-300 p-4"
    >
      <label htmlFor="name" className="text-sm font-medium text-gray-700">
        Workspace Name
      </label>
      <input
        id="name"
        name="name"
        type="text"
        required
        maxLength={100}
        className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
      />

      {state && !state.success && (
        <p role="alert" className="text-sm text-red-600 select-text">
          {state.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 self-start rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white transition disabled:opacity-50"
      >
        {isPending && <Spinner />}
        Create Workspace
      </button>
    </form>
  );
}
