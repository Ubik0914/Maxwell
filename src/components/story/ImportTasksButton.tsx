"use client";

import { useState } from "react";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { ImportTasksDialog } from "@/components/story/ImportTasksDialog";
import { ToolbarButton } from "@/components/graph/ToolbarButton";
import { ImportIcon } from "@/components/icons";

/**
 * Import, next to the "+" that adds one task, because it is the same
 * verb at a different scale.
 *
 * It sits here rather than in the story's own menu so that it has the
 * graph to hand: what a row is allowed to say it comes after is
 * whatever is already in this story, and the arrangement the new tasks
 * land in is computed against what is already drawn. From a menu it
 * would need a round trip before it could tell you either.
 */
export function ImportTasksButton({ storyId }: { storyId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const { nodes, edges } = usePendingGraph();

  return (
    <>
      <ToolbarButton label="Import tasks from CSV" onClick={() => setIsOpen(true)}>
        <ImportIcon />
      </ToolbarButton>

      {isOpen && (
        <ImportTasksDialog
          storyId={storyId}
          nodes={nodes}
          edges={edges}
          onClose={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
