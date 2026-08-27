"use client";

import { useMemo, useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { useReactFlow } from "@xyflow/react";
import type { FlowEdge, FlowNode } from "@/components/graph/types";
import { branchTaskFromNodeAction } from "@/features/graph/actions";
import { useToast } from "@/components/Toast";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";

/**
 * Where a branch from `nodeId` is allowed to rejoin.
 *
 * Its direct successors first — the ordinary case, "run this beside
 * what already follows" — and then GOAL, which every story has and
 * which nothing leaves, so it is always a safe landing point. Both
 * kinds are downstream of the branch point by construction, so no
 * option in this list can close a cycle. (GraphService re-checks
 * anyway; a client list is a convenience, not an authority.)
 */
function rejoinCandidates(
  nodeId: string,
  nodes: FlowNode[],
  edges: FlowEdge[],
): FlowNode[] {
  const byId = new Map(nodes.map((node) => [node.id, node]));
  const candidates: FlowNode[] = [];

  for (const edge of edges) {
    if (edge.source !== nodeId) continue;
    const target = byId.get(edge.target);
    if (target && !candidates.some((c) => c.id === target.id)) {
      candidates.push(target);
    }
  }

  const goal = nodes.find((node) => node.data.type === "GOAL");
  if (goal && goal.id !== nodeId && !candidates.some((c) => c.id === goal.id)) {
    candidates.push(goal);
  }

  return candidates;
}

/** The shape being added, so the rejoin choice is visible, not implied. */
function BranchDiagram() {
  return (
    <svg viewBox="0 0 220 72" className="h-16 w-full" aria-hidden="true">
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
      <circle
        cx="20"
        cy="20"
        r="5"
        fill="var(--surface)"
        stroke="var(--accent)"
        strokeWidth="2"
      />
      <circle
        cx="200"
        cy="20"
        r="5"
        fill="var(--surface)"
        stroke="var(--border-strong)"
        strokeWidth="2"
      />
    </svg>
  );
}

export function NodeBranchDialog({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  // Read straight off the live graph rather than threading nodes and
  // edges down through node data: this dialog is short-lived and is
  // always rendered inside the ReactFlowProvider.
  const { getNodes, getEdges } = useReactFlow<FlowNode, FlowEdge>();
  const nodes = getNodes();
  const edges = getEdges();

  const source = nodes.find((node) => node.id === nodeId);
  const candidates = useMemo(
    () => rejoinCandidates(nodeId, nodes, edges),
    [nodeId, nodes, edges],
  );

  const [targetNodeId, setTargetNodeId] = useState(candidates[0]?.id ?? "");
  const [title, setTitle] = useState("");
  const [isPending, startTransition] = useTransition();

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    startTransition(async () => {
      const result = await branchTaskFromNodeAction({
        sourceNodeId: nodeId,
        targetNodeId,
        title,
      });
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
      title="Branch"
      subtitle={
        source
          ? `A new task running parallel to what follows “${source.data.title}”.`
          : "A new task running parallel to what follows."
      }
      onClose={onClose}
    >
      {candidates.length === 0 ? (
        <p className="text-sm text-text-muted">
          There is nowhere for a branch from here to rejoin yet. Connect
          this task to something first.
        </p>
      ) : (
        <form
          id="branch-task-form"
          onSubmit={handleSubmit}
          className="flex flex-col gap-4"
        >
          <BranchDiagram />

          <div className="flex flex-col gap-1">
            <label
              htmlFor="branch-task-title"
              className="text-sm font-medium text-text-muted"
            >
              Title *
            </label>
            <input
              id="branch-task-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              maxLength={200}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="branch-rejoin-target"
              className="text-sm font-medium text-text-muted"
            >
              Rejoins at
            </label>
            <select
              id="branch-rejoin-target"
              value={targetNodeId}
              onChange={(e) => setTargetNodeId(e.target.value)}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
            >
              {candidates.map((candidate) => (
                <option key={candidate.id} value={candidate.id}>
                  {candidate.data.title}
                </option>
              ))}
            </select>
            <p className="text-xs text-text-faint">
              The new task has to be done before this one can start.
            </p>
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
              Branch
            </button>
          </div>
        </form>
      )}
    </Modal>
  );
}
