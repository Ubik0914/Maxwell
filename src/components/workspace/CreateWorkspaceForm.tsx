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
      className="flex flex-col gap-2 rounded-lg border border-dashed border-border p-4"
    >
      <label htmlFor="name" className="text-sm font-medium text-text-muted">
        Workspace Name
      </label>
      <input
        id="name"
        name="name"
        type="text"
        required
        maxLength={100}
        className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
      />

      {state && !state.success && (
        <p role="alert" className="text-sm text-danger select-text">
          {state.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center gap-2 self-start rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition hover:bg-accent-hover disabled:opacity-50"
      >
        {isPending && <Spinner />}
        Create Workspace
      </button>
    </form>
  );
}
