"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import {
  deleteEdgeAction,
  insertTaskOnEdgeAction,
} from "@/features/graph/actions";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";

/**
 * Renders the edge path plus a small floating "+" (insert a task on
 * this edge) / "x" (delete this edge) control at its midpoint.
 */
export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
}: EdgeProps) {
  const router = useRouter();
  const { showError } = useToast();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const [isInsertOpen, setIsInsertOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();
  useEscapeKey(() => setIsInsertOpen(false), isInsertOpen);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteEdgeAction(id);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleInsertSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await insertTaskOnEdgeAction({ edgeId: id, title });
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      setTitle("");
      setIsInsertOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} />
      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex items-center gap-1"
        >
          <button
            type="button"
            onClick={() => setIsInsertOpen(true)}
            title="Insert task"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-xs text-text-muted shadow-sm hover:border-accent hover:text-accent"
          >
            +
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            title="Delete connection"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-xs text-text-muted shadow-sm hover:border-danger hover:text-danger"
          >
            ×
          </button>
        </div>
      </EdgeLabelRenderer>

      {isInsertOpen && (
        <EdgeLabelRenderer>
          <div
            style={{ pointerEvents: "all" }}
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 px-4"
          >
            <div className="w-full max-w-md rounded-lg border border-border bg-surface p-6 shadow-xl">
              <div className="mb-4 flex items-center justify-between">
                <h2 className="text-lg font-semibold text-text">
                  Insert Task
                </h2>
                <button
                  type="button"
                  onClick={() => setIsInsertOpen(false)}
                  aria-label="Close"
                  className="text-text-faint hover:text-text"
                >
                  ×
                </button>
              </div>

              <form onSubmit={handleInsertSubmit} className="flex flex-col gap-4">
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
                    maxLength={200}
                    className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
                  />
                </div>

                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setIsInsertOpen(false)}
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
                    Insert
                  </button>
                </div>
              </form>
            </div>
          </div>
        </EdgeLabelRenderer>
      )}
    </>
  );
}
