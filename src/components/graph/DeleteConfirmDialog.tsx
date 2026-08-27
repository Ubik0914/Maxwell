"use client";

import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";

export function DeleteConfirmDialog({
  title,
  isPending,
  onConfirm,
  onCancel,
}: {
  title: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel, true);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4">
      <div className="w-full max-w-sm rounded-lg border border-border bg-surface p-6 shadow-xl">
        <h2 className="text-lg font-semibold text-text">
          Delete &quot;{title}&quot;?
        </h2>
        <p className="mt-2 text-sm text-text-muted">
          This will also remove its dependencies.
        </p>
        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={isPending}
            className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-inverse hover:bg-danger-hover disabled:opacity-50"
          >
            {isPending && <Spinner />}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
