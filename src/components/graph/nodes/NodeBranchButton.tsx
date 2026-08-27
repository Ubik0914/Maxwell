"use client";

import { useState } from "react";
import { NodeBranchDialog } from "@/components/graph/nodes/NodeBranchDialog";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { PlusIcon } from "@/components/icons";

/**
 * "Start a parallel line of work here", on the node itself.
 *
 * Branching used to be reachable only from a connection's "+", which
 * meant thinking in edges to express something about a task — and made
 * branching off a node you had just branched into a hunt for the right
 * line. This puts the same operation where the thought starts.
 *
 * Held at low opacity like the edge controls rather than revealed on
 * hover: hover doesn't exist on touch, and a control you cannot reach
 * on a phone is not a control. `nodrag`/`nopan` keep the press from
 * becoming a node drag, and the click is stopped from bubbling so it
 * doesn't also open the task panel behind the dialog.
 */
export function NodeBranchButton({ nodeId }: { nodeId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  useEscapeKey(() => setIsOpen(false), isOpen);

  return (
    <>
      <button
        type="button"
        onClick={(event) => {
          event.stopPropagation();
          setIsOpen(true);
        }}
        aria-label="Branch from this task"
        title="Branch from this task"
        className="nodrag nopan absolute -right-2 -bottom-2 flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-muted opacity-45 shadow-sm transition hover:border-accent hover:text-accent hover:opacity-100 focus-visible:opacity-100"
      >
        <PlusIcon className="h-3 w-3" />
      </button>

      {isOpen && (
        <NodeBranchDialog nodeId={nodeId} onClose={() => setIsOpen(false)} />
      )}
    </>
  );
}
