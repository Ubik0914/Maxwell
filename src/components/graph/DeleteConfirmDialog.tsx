"use client";

import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";

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
    <Modal
      title={`Delete "${title}"?`}
      onClose={onCancel}
      width="max-w-sm"
    >
      <p className="text-sm text-text-muted">
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
    </Modal>
  );
}
