"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getBezierPath,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdge } from "@/components/graph/types";
import { deleteEdgeAction } from "@/features/graph/actions";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { EdgeSpliceDialog } from "@/components/graph/edges/EdgeSpliceDialog";
import { CloseIcon, PlusIcon } from "@/components/icons";

/** Sparks are staggered across the travel time so the flow reads as a
 *  stream rather than as a metronome. */
const SPARK_OFFSETS = ["0s", "-0.8s", "-1.6s"];
const SPARK_DURATION = "2.4s";

/**
 * A dependency edge, drawn as a conduit rather than a connector.
 *
 * Three layers, all driven by graph state (see FlowEdgeData):
 *   1. the path itself — dim, lit, or damped
 *   2. drifting sparks while the source has energy to give
 *   3. a one-shot surge when a task upstream just completed, which is
 *      the change actually propagating through the DAG
 *
 * The sparks ride the very path BaseEdge draws (`<mpath href="#id">`),
 * so they keep following it while a node is being dragged, with no
 * geometry duplicated here.
 *
 * A small "+" (add a task here, in series or in parallel — see
 * EdgeSpliceDialog) / "x" (delete this edge) control sits at the
 * midpoint, held back at low opacity so the canvas stays about the
 * graph until you reach for it.
 */
export function CustomEdge({
  id,
  sourceX,
  sourceY,
  targetX,
  targetY,
  sourcePosition,
  targetPosition,
  data,
}: EdgeProps<FlowEdge>) {
  const router = useRouter();
  const { showError } = useToast();
  const [edgePath, labelX, labelY] = getBezierPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
  });

  const isLive = data?.live ?? false;
  const surgeId = data?.surgeId ?? null;

  const [isSpliceOpen, setIsSpliceOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  useEscapeKey(() => setIsSpliceOpen(false), isSpliceOpen);

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteEdgeAction(id);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    <>
      <BaseEdge id={id} path={edgePath} />

      {isLive &&
        SPARK_OFFSETS.map((begin) => (
          <circle key={begin} className="edge-spark" r="2.2">
            <animateMotion
              dur={SPARK_DURATION}
              begin={begin}
              repeatCount="indefinite"
            >
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        ))}

      {/* Remounted by its changing key, which is what replays the SMIL
          animation when the same edge surges twice. */}
      {surgeId !== null && (
        <g key={surgeId}>
          <path className="edge-surge-path" d={edgePath} />
          <circle className="edge-surge" r="4.5">
            <animateMotion dur="0.65s" fill="freeze" keyPoints="0;1" keyTimes="0;1" calcMode="spline" keySplines="0.3 0 0.2 1">
              <mpath href={`#${id}`} />
            </animateMotion>
          </circle>
        </g>
      )}

      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
            pointerEvents: "all",
          }}
          className="nodrag nopan flex items-center gap-1 opacity-45 transition-opacity duration-150 hover:opacity-100 focus-within:opacity-100"
        >
          <button
            type="button"
            onClick={() => setIsSpliceOpen(true)}
            aria-label="Add task"
            title="Add task"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-sm transition-colors hover:border-accent hover:text-accent"
          >
            <PlusIcon className="h-3 w-3" />
          </button>
          <button
            type="button"
            onClick={handleDelete}
            disabled={isPending}
            aria-label="Delete connection"
            title="Delete connection"
            className="flex h-5 w-5 items-center justify-center rounded-full border border-border bg-surface text-text-muted shadow-sm transition-colors hover:border-danger hover:text-danger"
          >
            <CloseIcon className="h-3 w-3" />
          </button>
        </div>
      </EdgeLabelRenderer>

      {isSpliceOpen && (
        <EdgeSpliceDialog
          edgeId={id}
          onClose={() => setIsSpliceOpen(false)}
        />
      )}
    </>
  );
}
