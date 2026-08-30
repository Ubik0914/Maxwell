"use client";

import { useReactFlow } from "@xyflow/react";
import { CreateTaskDialog } from "@/components/graph/CreateTaskDialog";
import { ImportTasksButton } from "@/components/story/ImportTasksButton";
import { ToolbarButton } from "@/components/graph/ToolbarButton";
import {
  AutoLayoutIcon,
  FitViewIcon,
  ResetViewIcon,
  ZoomInIcon,
  ZoomOutIcon,
} from "@/components/icons";

export function GraphToolbar({
  storyId,
  onAutoLayout,
}: {
  storyId: string;
  onAutoLayout: () => void;
}) {
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();

  return (
    <div className="absolute bottom-3 left-3 flex items-center gap-0.5 rounded-full border border-border bg-surface/85 p-1 shadow-lg backdrop-blur-sm sm:bottom-4 sm:left-4">
      <CreateTaskDialog storyId={storyId} />
      <ImportTasksButton storyId={storyId} />
      <ToolbarButton
        label="Arrange by dependency"
        onClick={() => {
          onAutoLayout();
          // After the nodes have set off, not before: fitting to where
          // they used to be and then watching them leave the frame is
          // worse than a beat of delay.
          setTimeout(() => fitView({ duration: 400 }), 80);
        }}
      >
        <AutoLayoutIcon />
      </ToolbarButton>
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
