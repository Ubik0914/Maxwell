"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { insertTaskOnEdgeAction } from "@/features/graph/actions";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { pendingId, pendingTask } from "@/domain/graph/pending";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Modal } from "@/components/Modal";
import { SpliceDiagram } from "@/components/graph/SpliceDiagram";

/**
 * The dialog behind a connection's "+": a task goes in the middle of
 * this connection, and the connection becomes two.
 *
 * It used to open by asking Insert or Branch. Both operations still
 * exist, but the question was in the wrong place: a connection is a
 * line between two things, so the only thing it can mean to add a task
 * *to a connection* is to put one in the middle. Branching is a
 * statement about a task, not about a line, and it is asked where that
 * thought starts — the "+" on the node itself. So this asks one thing,
 * and the diagram shows what will happen rather than offering a choice
 * about it.
 *
 * The dialog closes before the write goes out, for the reason given in
 * AddNextTaskDialog: the decision was made when Insert was pressed.
 */
export function EdgeSpliceDialog({
  edgeId,
  sourceNodeId,
  targetNodeId,
  at,
  onClose,
}: {
  edgeId: string;
  sourceNodeId: string;
  targetNodeId: string;
  /** Where on the canvas the new node should appear — the midpoint of
   *  the connection it is going into. */
  at: { x: number; y: number };
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const pending = usePendingGraph();
  // Read off the connection's own source rather than passed in: the
  // edge component knows which nodes it joins, not which story it is.
  const storyId =
    pending.nodes.find((node) => node.id === sourceNodeId)?.storyId ?? "";
  const [title, setTitle] = useState("");
  const [, startTransition] = useTransition();
  // Owned here, not left to the caller — see AddNextTaskDialog.
  useEscapeKey(onClose, true);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClose();

    // The connection becomes two with the task between them, drawn
    // before the request leaves.
    const task = pendingTask({ storyId, title, status: "BLOCKED", ...at });
    pending.spliceEdge(edgeId, task, [
      { id: pendingId(), storyId, sourceNodeId, targetNodeId: task.id },
      { id: pendingId(), storyId, sourceNodeId: task.id, targetNodeId },
    ]);

    startTransition(async () => {
      const result = await insertTaskOnEdgeAction({
        edgeId,
        title,
        mode: "insert",
      });
      if (!result.success) {
        pending.revert();
        showError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Modal
      title="Insert task"
      subtitle="This connection becomes two, with the new task between them."
      onClose={onClose}
    >
      <form
        id="insert-task-form"
        onSubmit={handleSubmit}
        className="flex flex-col gap-4"
      >
        <SpliceDiagram />

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
            className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover"
          >
            Insert
          </button>
        </div>
      </form>
    </Modal>
  );
}
