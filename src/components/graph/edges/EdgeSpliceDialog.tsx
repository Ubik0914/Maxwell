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
 * What each mode does to the graph, drawn rather than described: the
 * existing nodes as terminals, the new task as a node card on the path
 * it will occupy. Two shapes tell the difference faster than two
 * sentences, and this is the one choice a reader has to get right
 * before typing anything.
 */
function ModeDiagram({ mode }: { mode: EdgeSpliceMode }) {
  const isBranch = mode === "branch";

  return (
    <svg
      viewBox="0 0 220 72"
      className="h-16 w-full"
      role="img"
      aria-label={
        isBranch
          ? "The existing connection stays, and a new task is added on a parallel path that rejoins it"
          : "The existing connection is replaced by one running through a new task"
      }
    >
      {isBranch ? (
        <>
          <path
            d="M20 20H200"
            stroke="var(--border-strong)"
            strokeWidth="2"
            fill="none"
          />
          <path
            d="M20 20C60 20 60 52 110 52C160 52 160 20 200 20"
            stroke="var(--accent)"
            strokeWidth="2"
            fill="none"
            opacity="0.7"
          />
          <rect
            x="90"
            y="43"
            width="40"
            height="18"
            rx="5"
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth="1.5"
          />
        </>
      ) : (
        <>
          <path
            d="M20 36H200"
            stroke="var(--accent)"
            strokeWidth="2"
            fill="none"
            opacity="0.7"
          />
          <rect
            x="90"
            y="27"
            width="40"
            height="18"
            rx="5"
            fill="var(--surface)"
            stroke="var(--accent)"
            strokeWidth="1.5"
          />
        </>
      )}
      <circle
        cx="20"
        cy={isBranch ? 20 : 36}
        r="5"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
      <circle
        cx="200"
        cy={isBranch ? 20 : 36}
        r="5"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
    </svg>
  );
}

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

        <ModeDiagram mode={mode} />

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
