"use client";

import { useMemo } from "react";
import type { FlowEdge, FlowNode } from "@/components/graph/types";
import { calculateStoryStatus } from "@/domain/graph/story-status";
import { routeEdges } from "@/domain/graph/edge-route";
import { useEnergyFlow } from "@/features/graph/hooks/useEnergyFlow";

/**
 * An edge "flows" once its source has actually produced something to
 * flow downstream: Start (the always-ready origin) or a Done task.
 * Anything upstream of unfinished work stays a static line, so the
 * animation tracks real progress through the DAG instead of just
 * decorating every connection uniformly.
 */
function isFlowingSource(node: FlowNode | undefined): boolean {
  if (!node) return false;
  return node.data.type === "START" || node.data.status === "DONE";
}

/**
 * Turns the graph's state into the nodes and edges React Flow should
 * draw right now.
 *
 * All of it is derived per render rather than stored, so there is no
 * second copy of the graph to keep in step: a Realtime status change
 * re-lights the right edges on the very next render, with no sync
 * effect anywhere. And when nothing is happening the memos return the
 * identical arrays they returned last time, so React Flow re-renders
 * nothing at all.
 */
export function useGraphPresentation({
  flowNodes,
  flowEdges,
  storyId,
}: {
  flowNodes: FlowNode[];
  flowEdges: FlowEdge[];
  storyId: string;
}): { displayNodes: FlowNode[]; displayEdges: FlowEdge[] } {
  // Every transition the graph just went through — a task completing, a
  // successor unblocking, a node being spliced in. It expires on its own
  // timers, so the canvas returns to rest without anything to reset.
  const { pulses, emitters, arrivals } = useEnergyFlow(flowNodes);

  // Has the graph actually arrived at the goal? Decided by the very rule
  // that sets the story's own status, so the goal lighting up and the
  // story reading COMPLETED can never disagree. Until then the goal is
  // drawn dark: it's a destination, not an achievement.
  const goalReached = useMemo(() => {
    const domainNodes = flowNodes.map((node) => node.data);
    const domainEdges = flowEdges.map((edge) => ({
      id: edge.id,
      storyId,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
    }));
    return calculateStoryStatus(domainNodes, domainEdges) === "COMPLETED";
  }, [flowNodes, flowEdges, storyId]);

  const displayNodes = useMemo(() => {
    if (pulses.size === 0 && !goalReached) return flowNodes;
    return flowNodes.map((node) => {
      const pulse = pulses.get(node.id);
      const reached = goalReached && node.data.type === "GOAL";
      if (!pulse && !reached) return node;
      return { ...node, data: { ...node.data, pulse, reached } };
    });
  }, [flowNodes, pulses, goalReached]);

  /*
   * Which connections are drawn between their ends and which are taken
   * around the outside of the graph.
   *
   * Read off the positions React Flow currently holds rather than off
   * the domain node, because those are the ones on screen: a node
   * halfway through being dragged has moved on the canvas and not yet
   * anywhere else, and a lane computed from where it used to be would
   * be a lane the line no longer runs along.
   */
  const routes = useMemo(() => {
    const placed = flowNodes.map((node) => ({
      ...node.data,
      positionX: node.position.x,
      positionY: node.position.y,
    }));
    const domainEdges = flowEdges.map((edge) => ({
      id: edge.id,
      storyId,
      sourceNodeId: edge.source,
      targetNodeId: edge.target,
    }));
    return routeEdges(placed, domainEdges);
  }, [flowNodes, flowEdges, storyId]);

  // An edge surges when its source just emitted (a task turned DONE, or
  // a node materialised), and also when its *target* just materialised —
  // that second case is what makes an inserted node light up on both
  // sides while still drawing every spark source -> target.
  const displayEdges = useMemo(() => {
    const nodeById = new Map(flowNodes.map((n) => [n.id, n]));
    return flowEdges.map((edge) => {
      const live = isFlowingSource(nodeById.get(edge.source));
      const waiting = nodeById.get(edge.target)?.data.status === "BLOCKED";
      const surgeId =
        emitters.get(edge.source) ?? arrivals.get(edge.target) ?? null;

      return {
        ...edge,
        className: live ? "edge-live" : waiting ? "edge-waiting" : undefined,
        data: { live, waiting, surgeId, route: routes.get(edge.id) },
      };
    });
  }, [flowEdges, flowNodes, emitters, arrivals, routes]);

  return { displayNodes, displayEdges };
}
