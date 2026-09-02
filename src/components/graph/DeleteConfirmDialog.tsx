"use client";

import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";

/**
 * `note` is what goes with the thing being deleted, said plainly.
 * Tasks take their dependencies with them, which is the default
 * because it is what this dialog was written for; anything else that
 * takes something with it says so in its own words rather than
 * borrowing that sentence.
 */
export function DeleteConfirmDialog({
  title,
  note = "This will also remove its dependencies.",
  isPending,
  onConfirm,
  onCancel,
}: {
  title: string;
  note?: string;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEscapeKey(onCancel, true);

  return (
    <Modal
      title={`Delete "${title}"?`}
      onClose={onCancel}
      width="max-w-sm"
    >
      <p className="text-sm text-text-muted">{note}</p>
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
    </Modal>
  );
}
