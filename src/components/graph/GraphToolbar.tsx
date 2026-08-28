"use client";

import { useReactFlow } from "@xyflow/react";
import { CreateTaskDialog } from "@/components/graph/CreateTaskDialog";
import { ToolbarButton } from "@/components/graph/ToolbarButton";
import {
  FitViewIcon,
  ResetViewIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/components/icons";

export function GraphToolbar({ storyId }: { storyId: string }) {
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();

  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-full border border-border bg-surface/85 p-1 shadow-lg backdrop-blur-sm sm:bottom-4 sm:left-4">
      <CreateTaskDialog storyId={storyId} />
      <span aria-hidden="true" className="mx-1 h-4 w-px bg-border" />
      <ToolbarButton label="Fit view" onClick={() => fitView()}>
        <FitViewIcon />
      </ToolbarButton>
      <ToolbarButton label="Zoom out" onClick={() => zoomOut()}>
        <ZoomOutIcon />
      </ToolbarButton>
      <ToolbarButton label="Zoom in" onClick={() => zoomIn()}>
        <ZoomInIcon />
      </ToolbarButton>
      <ToolbarButton
        label="Reset view"
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
      >
        <ResetViewIcon />
      </ToolbarButton>
    </div>
  );
}
