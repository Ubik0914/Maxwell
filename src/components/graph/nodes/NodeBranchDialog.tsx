"use client";

import { useReactFlow } from "@xyflow/react";
import type { FlowEdge, FlowNode } from "@/components/graph/types";
import { AddNextTaskDialog } from "@/components/task/AddNextTaskDialog";

/**
 * The graph's own "add what comes next", which is the shared dialog fed
 * from the live canvas.
 *
 * This used to hold its own copy of the rejoin rule and its own form.
 * Both now live with the dialog the list and the board use, so the
 * three surfaces cannot drift into offering different choices for the
 * same operation — all this does is translate React Flow's nodes back
 * into the domain shape the dialog speaks.
 *
 * Reading straight off the canvas (rather than threading nodes and
 * edges down through node data) is safe because this is short-lived and
 * always rendered inside the ReactFlowProvider.
 */
export function NodeBranchDialog({
  nodeId,
  onClose,
}: {
  nodeId: string;
  onClose: () => void;
}) {
  const { getNodes, getEdges } = useReactFlow<FlowNode, FlowEdge>();

  const nodes = getNodes().map((node) => node.data);
  const edges = getEdges().map((edge) => ({
    id: edge.id,
    storyId: "",
    sourceNodeId: edge.source,
    targetNodeId: edge.target,
  }));

  const source = nodes.find((node) => node.id === nodeId);
  if (!source) return null;

  return (
    <AddNextTaskDialog
      source={source}
      nodes={nodes}
      edges={edges}
      onClose={onClose}
    />
  );
}
