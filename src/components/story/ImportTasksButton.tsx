"use client";

import { useState } from "react";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { useBeta } from "@/hooks/useBeta";
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
 *
 * Behind the beta switch while it is new. It writes a lot at once and
 * reads files somebody else's spreadsheet wrote, which are the two
 * things most likely to surprise us — so it is off until asked for,
 * rather than sitting in everybody's toolbar being discovered.
 */
export function ImportTasksButton({ storyId }: { storyId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const isBeta = useBeta();
  const { nodes, edges } = usePendingGraph();

  if (!isBeta) return null;

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
