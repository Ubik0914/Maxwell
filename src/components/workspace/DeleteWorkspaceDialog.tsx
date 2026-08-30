"use client";

import { useId, useState } from "react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { useEscapeKey } from "@/hooks/useEscapeKey";

/**
 * The confirmation for the one delete that takes everything.
 *
 * A story's confirmation is a button, because a story is one thing and
 * whoever pressed Delete was looking at it. A workspace is every story
 * in it, every task in those, and everybody else's access — and the
 * press that opens this comes from a list, where the row under the
 * pointer is not always the row you thought. So the name has to be
 * typed. It is the difference between "are you sure" and "say which",
 * and only the second one is answerable by someone who has misread the
 * list.
 *
 * The count is said out loud for the same reason: "this will delete 14
 * stories" is a fact that can be weighed, where "this cannot be undone"
 * is a sentence everyone has read a hundred times and nobody reads any
 * more.
 */
export function DeleteWorkspaceDialog({
  name,
  storyCount,
  isPending,
  onConfirm,
  onCancel,
}: {
  name: string;
  storyCount: number;
  isPending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const [typed, setTyped] = useState("");
  const inputId = useId();
  useEscapeKey(onCancel, true, { exclusive: true });

  // Trimmed, because a name pasted out of the list brings a space with
  // it often enough, and matching that space would be a puzzle rather
  // than a safeguard.
  const matches = typed.trim() === name;

  return (
    <Modal title={`Delete "${name}"?`} onClose={onCancel} width="max-w-md">
      <p className="text-sm text-text-muted">
        {storyCount === 0
          ? "It has no stories in it."
          : `Its ${storyCount} ${
              storyCount === 1 ? "story goes" : "stories go"
            } with it, and every task and dependency in them.`}{" "}
        Everyone else in this workspace loses their access. Nothing here
        can be recovered.
      </p>

      <form
        onSubmit={(event) => {
          event.preventDefault();
          if (matches && !isPending) onConfirm();
        }}
        className="mt-4 flex flex-col gap-1.5"
      >
        <label htmlFor={inputId} className="text-xs text-text-faint">
          Type <span className="font-medium text-text-muted">{name}</span> to
          confirm.
        </label>
        <input
          id={inputId}
          value={typed}
          onChange={(event) => setTyped(event.target.value)}
          autoFocus
          autoComplete="off"
          spellCheck={false}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text transition-colors focus:border-danger focus:outline-none"
        />

        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            onClick={onCancel}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={!matches || isPending}
            className="flex items-center gap-2 rounded-md bg-danger px-4 py-2 text-sm font-medium text-inverse transition-opacity hover:bg-danger-hover disabled:opacity-40"
          >
            {isPending && <Spinner />}
            Delete workspace
          </button>
        </div>
      </form>
    </Modal>
  );
}
