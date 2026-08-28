"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import { rejoinCandidates } from "@/domain/graph/branch";
import { branchTaskFromNodeAction } from "@/features/graph/actions";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { pendingId, pendingTask } from "@/domain/graph/pending";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Modal } from "@/components/Modal";
import { Chip, CHIP_SET } from "@/components/ui/Chip";
import { Select } from "@/components/ui/Select";
import { ArrowLeftIcon } from "@/components/icons";

/**
 * A fixed link in the chain — something already decided, in the same
 * pill the picker beside it wears so the run reads as one row of
 * equals rather than a control with decoration either side.
 */
function Pill({
  tone,
  children,
}: {
  tone?: string;
  children: React.ReactNode;
}) {
  return (
    <Chip tone={tone} className="max-w-[11rem]">
      <span className="min-w-0 truncate">{children}</span>
    </Chip>
  );
}

function Link({ children }: { children: React.ReactNode }) {
  return <span className="flex items-center gap-1.5">{children}</span>;
}

function Arrow() {
  return (
    // Already aria-hidden: every icon in the set is decorative.
    <ArrowLeftIcon className="h-3 w-3 shrink-0 rotate-180 text-text-faint" />
  );
}

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
 * The second decision used to be a field labelled "Before", which named
 * the right task and framed it backwards: you arrive here having
 * pressed "+" on something, thinking forwards, and are asked what the
 * new task comes *before*. The chain says it the way round it happened
 * instead — where you started, what you are adding, and then the one
 * end still open, which is the only part you choose. Sitting third in a
 * left-to-right run is what makes the picker unambiguous; a label
 * cannot do that on its own, since "After: Ship the release" reads
 * equally well as either direction.
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
  const pending = usePendingGraph();
  const candidates = useMemo(
    () => rejoinCandidates(source.id, nodes, edges),
    [source.id, nodes, edges],
  );

  const [targetNodeId, setTargetNodeId] = useState(candidates[0]?.id ?? "");
  const targetTitle = candidates.find((c) => c.id === targetNodeId)?.title;
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

    // The task and both its connections are on the graph before the
    // request leaves. Its status is the one the Status Engine will
    // reach anyway: work behind something unfinished is blocked.
    const task = pendingTask({
      storyId: source.storyId,
      title,
      status: source.status === "DONE" ? "READY" : "BLOCKED",
      x: source.positionX + 220,
      y: source.positionY + 120,
    });
    pending.addNode(task, [
      {
        id: pendingId(),
        storyId: source.storyId,
        sourceNodeId: source.id,
        targetNodeId: task.id,
      },
      {
        id: pendingId(),
        storyId: source.storyId,
        sourceNodeId: task.id,
        targetNodeId,
      },
    ]);

    startTransition(async () => {
      const result = await branchTaskFromNodeAction({
        sourceNodeId: source.id,
        targetNodeId,
        title,
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

          <div className="flex flex-col gap-1.5">
            <span className="text-sm font-medium text-text-muted">
              What it leads to
            </span>
            <div
              role="group"
              aria-label="Where the new task sits"
              className="flex flex-wrap items-center gap-1.5 rounded-lg border border-border bg-bg/60 p-2.5"
            >
              <Pill>{source.title}</Pill>
              {/* Each arrow travels with what it points at, so a chain
                  too wide for the dialog wraps between links rather
                  than leaving an arrow pointing off the end of a
                  line. */}
              <Link>
                <Arrow />
                <Pill tone="border-accent/40 bg-accent-soft text-accent">
                  {title.trim() || "New task"}
                </Pill>
              </Link>
              <Link>
                <Arrow />
                <Select
                  id="next-task-rejoin"
                  label="What comes after the new task"
                  variant="chip"
                  tone={CHIP_SET}
                  value={targetNodeId}
                  options={candidates.map((candidate) => ({
                    value: candidate.id,
                    label: candidate.title,
                  }))}
                  onChange={setTargetNodeId}
                />
              </Link>
            </div>
            <p className="text-xs text-text-faint">
              {targetTitle
                ? `“${targetTitle}” can only start once the new task is done.`
                : "Pick where this line of work rejoins."}
            </p>
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
              Add
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
