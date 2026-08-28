"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import { rejoinCandidates } from "@/domain/graph/branch";
import { branchTaskFromNodeAction } from "@/features/graph/actions";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Modal } from "@/components/Modal";
import { SpliceDiagram } from "@/components/graph/SpliceDiagram";
import { Select } from "@/components/ui/Select";

/**
 * "What comes after this one?" — the graph's branch operation, asked in
 * the language of a task list.
 *
 * The list and the board have no canvas to draw a connection on, so the
 * only way to say "then do this" from there is a dialog. It is the same
 * server action the graph's own branch uses, and it takes the same two
 * decisions: the title, and where the new task rejoins the path it came
 * from. Every story ends at GOAL, so there is always somewhere to
 * rejoin and never a dead-end task hanging off the side of the graph.
 *
 * The dialog closes before the write goes out. The decision was made
 * when Add was pressed; keeping a spinner on screen until the server
 * agrees makes the interface feel like it is asking permission. If the
 * write fails, a toast says so — one failure interrupting is better
 * than every success waiting.
 */
export function AddNextTaskDialog({
  source,
  nodes,
  edges,
  onClose,
}: {
  source: GraphNode;
  nodes: GraphNode[];
  edges: GraphEdge[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const candidates = useMemo(
    () => rejoinCandidates(source.id, nodes, edges),
    [source.id, nodes, edges],
  );

  const [targetNodeId, setTargetNodeId] = useState(candidates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [, startTransition] = useTransition();
  // Owned here rather than left to the caller. The graph's two entry
  // points happened to register it themselves; the list and the board
  // did not, so the same dialog closed on Escape from one surface and
  // not from another. A dialog's way out belongs to the dialog.
  useEscapeKey(onClose, true);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    onClose();
    startTransition(async () => {
      const result = await branchTaskFromNodeAction({
        sourceNodeId: source.id,
        targetNodeId,
        title,
      });
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <Modal
      title="Add next task"
      subtitle={`A new task to do after “${source.title}”.`}
      onClose={onClose}
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-text-muted">
          There is nowhere for a task after this one to rejoin yet.
          Connect this task to something on the graph first.
        </p>
      ) : (
        <form onSubmit={handleSubmit} className="flex flex-col gap-4">
          <SpliceDiagram shape="branch" />

          <div className="flex flex-col gap-1">
            <label
              htmlFor="next-task-title"
              className="text-sm font-medium text-text-muted"
            >
              Title *
            </label>
            <input
              id="next-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              maxLength={200}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <Select
            id="next-task-rejoin"
            label="Before"
            value={targetNodeId}
            options={candidates.map((candidate) => ({
              value: candidate.id,
              label: candidate.title,
            }))}
            onChange={setTargetNodeId}
            hint="The new task has to be done before this one can start."
          />

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
              Add
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
