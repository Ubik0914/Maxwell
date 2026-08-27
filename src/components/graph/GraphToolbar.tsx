"use client";

import { useReactFlow } from "@xyflow/react";
import { CreateTaskDialog } from "@/components/graph/CreateTaskDialog";

export function GraphToolbar({ storyId }: { storyId: string }) {
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();

  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md border border-border bg-surface px-3 py-2 shadow-lg">
      <CreateTaskDialog storyId={storyId} />
      <span className="text-border-strong">|</span>
      <button
        type="button"
        onClick={() => fitView()}
        className="text-sm text-text-muted hover:text-accent"
      >
        Fit View
      </button>
      <span className="text-border-strong">|</span>
      <button
        type="button"
        onClick={() => zoomOut()}
        aria-label="Zoom out"
        className="text-sm text-text-muted hover:text-accent"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => zoomIn()}
        aria-label="Zoom in"
        className="text-sm text-text-muted hover:text-accent"
      >
        +
      </button>
      <span className="text-border-strong">|</span>
      <button
        type="button"
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        className="text-sm text-text-muted hover:text-accent"
      >
        Reset View
      </button>
    </div>
  );
}
