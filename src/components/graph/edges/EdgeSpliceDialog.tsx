"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  insertTaskOnEdgeAction,
  type EdgeSpliceMode,
} from "@/features/graph/actions";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { SpliceDiagram } from "@/components/graph/SpliceDiagram";

const MODES: {
  value: EdgeSpliceMode;
  label: string;
  hint: string;
}[] = [
  {
    value: "insert",
    label: "Insert",
    hint: "In series — this connection becomes two",
  },
  {
    value: "branch",
    label: "Branch",
    hint: "In parallel — a second path, rejoining here",
  },
];

/**
 * The dialog behind a connection's "+". It asks which shape to add
 * before it asks for a title, because the shape is the decision — the
 * title is just the label on it.
 */
export function EdgeSpliceDialog({
  edgeId,
  onClose,
}: {
  edgeId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [mode, setMode] = useState<EdgeSpliceMode>("insert");
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  const action = MODES.find((m) => m.value === mode)!;

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await insertTaskOnEdgeAction({ edgeId, title, mode });
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      setTitle("");
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal
      title="Add Task"
      subtitle="Put a new node on this connection."
      onClose={onClose}
    >
      <form
        id="insert-task-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <div
          role="radiogroup"
          aria-label="How to add the task"
          className="grid grid-cols-2 gap-1 rounded-lg border border-border bg-bg p-1"
        >
          {MODES.map((option) => {
            const isActive = option.value === mode;
            return (
              <button
                key={option.value}
                type="button"
                role="radio"
                aria-checked={isActive}
                onClick={() => setMode(option.value)}
                className={`rounded-md px-3 py-2 text-left transition-colors ${
                  isActive
                    ? "bg-accent-soft text-accent"
                    : "text-text-muted hover:bg-surface-hover hover:text-text"
                }`}
              >
                <span className="block text-sm font-medium">
                  {option.label}
                </span>
                <span className="mt-0.5 block text-[11px] leading-tight text-text-faint">
                  {option.hint}
                </span>
              </button>
            );
          })}
        </div>

        <SpliceDiagram shape={mode} />

        <div className="flex flex-col gap-1">
          <label
            htmlFor="insert-task-title"
            className="text-sm font-medium text-text-muted"
          >
            Title *
          </label>
          <input
            id="insert-task-title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            required
            autoFocus
            maxLength={200}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
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
            {action.label}
          </button>
        </div>
      </form>
    </Modal>
  );
}
