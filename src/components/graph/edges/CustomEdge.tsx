"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  BaseEdge,
  EdgeLabelRenderer,
  getSmoothStepPath,
  type EdgeProps,
} from "@xyflow/react";
import type { FlowEdge } from "@/components/graph/types";
import { outerRoutePoints } from "@/domain/graph/edge-route";
import {
  longestRunMidpoint,
  orthogonalPath,
} from "@/components/graph/edges/orthogonal";
import { deleteEdgeAction } from "@/features/graph/actions";
import { usePendingGraph } from "@/features/graph/pending-graph";
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
 *   1. the path itself — lit, waiting, or dead
 *   2. drifting sparks while the source has energy to give
 *   3. a one-shot surge when a task upstream just completed, which is
 *      the change actually propagating through the DAG
 *
 * The sparks ride the very path BaseEdge draws (`<mpath href="#id">`),
 * so they keep following it while a node is being dragged, with no
 * geometry duplicated here.
 *
 * A small "+" (add a task here — see EdgeSpliceDialog) / "x" (delete
 * this edge) control sits at the midpoint, and appears when the pointer
 * is on the connection. It cannot be revealed by CSS the way a node's
 * "+" is: EdgeLabelRenderer portals it out of the edge and into a layer
 * of its own, so there is no ancestor to hang `:hover` on.
 *
 * So the canvas reports it instead — onEdgeMouseEnter, which fires off
 * React Flow's own wide invisible interaction path. This used to draw a
 * second such path of its own, which worked and also put a 28px ribbon
 * of pointer target along every connection, over whatever the line
 * happened to pass across. Reusing the one React Flow already maintains
 * costs nothing and covers nothing.
 *
 * The control still keeps itself shown while the pointer is on it: by
 * then the pointer has left the line, and the canvas has already said
 * so.
 */
export function CustomEdge({
  id,
  source,
  target,
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
  const pending = usePendingGraph();
  /*
   * Two ways a connection is drawn, and the layout has already decided
   * which — see routeEdges.
   *
   * A short one is a stepped line between its two ends: out of the
   * card, across, and in. Stepped rather than a bezier because a run
   * that is always horizontal or always vertical is one the eye can
   * follow through a crowd, and because two of them side by side stay
   * side by side instead of bowing into each other.
   *
   * A long one has been taken out of the picture altogether, up over
   * the top of the graph or down under the bottom of it, and is drawn
   * through the corners that route turns. Without a route — the canvas
   * that shows every story at once computes none, because it draws each
   * story's own saved arrangement rather than a layout of its own —
   * every edge is a short one.
   */
  const route = data?.route;
  const outer =
    route?.kind === "outer"
      ? outerRoutePoints(
          { x: sourceX, y: sourceY },
          { x: targetX, y: targetY },
          route.laneY,
        )
      : null;

  const [steppedPath, steppedLabelX, steppedLabelY] = getSmoothStepPath({
    sourceX,
    sourceY,
    sourcePosition,
    targetX,
    targetY,
    targetPosition,
    borderRadius: 12,
    // Where the line changes rows. Halfway by default, which for a hop
    // to the next column is the gap between the two; a line reaching
    // further is told which gap to turn in, so that it turns in empty
    // space and so that everything arriving at the same task turns in
    // the same place.
    ...(route?.kind === "direct" && route.centerX !== undefined
      ? { centerX: route.centerX }
      : {}),
  });

  const edgePath = outer ? orthogonalPath(outer) : steppedPath;
  const label = outer ? longestRunMidpoint(outer) : { x: steppedLabelX, y: steppedLabelY };
  const labelX = label.x;
  const labelY = label.y;

  const isLive = data?.live ?? false;
  const surgeId = data?.surgeId ?? null;

  const [isSpliceOpen, setIsSpliceOpen] = useState(false);
  const [isOnControl, setIsOnControl] = useState(false);
  const [isPending, startTransition] = useTransition();
  const isShown = (data?.hovered ?? false) || isOnControl;
  useEscapeKey(() => setIsSpliceOpen(false), isSpliceOpen);

  /** The line goes first; the write follows it. */
  function handleDelete() {
    pending.removeEdge(id);
    startTransition(async () => {
      const result = await deleteEdgeAction(id);
      if (!result.success) {
        pending.revert();
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
          <circle key={begin} className="edge-spark" r="3.2">
            {/* The geometry goes in `path` rather than a <mpath href>
                pointing at the edge. mpath is the tidier form — it
                follows the line live while a node is dragged — but it
                resolves an id, and WebKit has never been reliable about
                doing that for the SVG2 `href` spelling. `path` has been
                in animateMotion since SVG 1.1 and resolves nothing, so
                it works the same everywhere. The cost is that a spark
                restarts while its node is being dragged, which is a
                moment nobody is watching the flow anyway. */}
            <animateMotion
              path={edgePath}
              dur={SPARK_DURATION}
              begin={begin}
              repeatCount="indefinite"
            />
          </circle>
        ))}

      {/* Remounted by its changing key, which is what replays the SMIL
          animation when the same edge surges twice. */}
      {surgeId !== null && (
        <g key={surgeId}>
          <path className="edge-surge-path" d={edgePath} />
          <circle className="edge-surge" r="5">
            <animateMotion
              path={edgePath}
              dur="0.65s"
              fill="freeze"
              keyPoints="0;1"
              keyTimes="0;1"
              calcMode="spline"
              keySplines="0.3 0 0.2 1"
            />
          </circle>
        </g>
      )}

      <EdgeLabelRenderer>
        <div
          style={{
            position: "absolute",
            transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)`,
          }}
          onPointerEnter={() => setIsOnControl(true)}
          onPointerLeave={() => setIsOnControl(false)}
          className={`nodrag nopan canvas-control flex items-center gap-1 ${
            isShown ? "canvas-control-shown" : ""
          }`}
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
          sourceNodeId={source}
          targetNodeId={target}
          // The midpoint of the line, in canvas coordinates — the same
          // place the "+" that opened this sits.
          at={{ x: labelX, y: labelY }}
          onClose={() => setIsSpliceOpen(false)}
        />
      )}
    </>
  );
}
