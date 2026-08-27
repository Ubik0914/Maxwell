"use client";

import { useReactFlow } from "@xyflow/react";

export function GraphToolbar() {
  const { fitView, zoomIn, zoomOut, setViewport } = useReactFlow();

  return (
    <div className="absolute bottom-4 left-4 flex items-center gap-2 rounded-md border border-gray-200 bg-white px-3 py-2 shadow-sm">
      <button
        type="button"
        onClick={() => fitView()}
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        Fit View
      </button>
      <span className="text-gray-300">|</span>
      <button
        type="button"
        onClick={() => zoomOut()}
        aria-label="Zoom out"
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        −
      </button>
      <button
        type="button"
        onClick={() => zoomIn()}
        aria-label="Zoom in"
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        +
      </button>
      <span className="text-gray-300">|</span>
      <button
        type="button"
        onClick={() => setViewport({ x: 0, y: 0, zoom: 1 })}
        className="text-sm text-gray-600 hover:text-gray-900"
      >
        Reset View
      </button>
    </div>
  );
}
