"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
  type Connection,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode, GraphEdge } from "@/domain/graph/types";
import { calculateStoryStatus } from "@/domain/graph/story-status";
import type {
  FlowEdge,
  FlowNode,
  FlowNodeData,
} from "@/components/graph/types";
import { StartNode } from "@/components/graph/nodes/StartNode";
import { TaskNode } from "@/components/graph/nodes/TaskNode";
import { GoalNode } from "@/components/graph/nodes/GoalNode";
import { CustomEdge } from "@/components/graph/edges/CustomEdge";
import { GraphToolbar } from "@/components/graph/GraphToolbar";
import { TaskPanel } from "@/components/graph/TaskPanel";
import {
  updateNodePositionAction,
  createEdgeAction,
} from "@/features/graph/actions";
import { useGraphRealtime } from "@/features/graph/hooks/useGraphRealtime";
import { useEnergyFlow } from "@/features/graph/hooks/useEnergyFlow";
import { useToast } from "@/components/Toast";

const nodeTypes: NodeTypes = {
  START: StartNode,
  TASK: TaskNode,
  GOAL: GoalNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

function toFlowNodes(nodes: GraphNode[]): FlowNode[] {
  return nodes.map((node) => ({
    id: node.id,
    type: node.type,
    position: { x: node.positionX, y: node.positionY },
    data: node as FlowNodeData,
  }));
}

function toFlowEdges(edges: GraphEdge[]): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    type: "custom",
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    data: { live: false, damped: false, surgeId: null },
  }));
}

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

export function StoryGraph({
  nodes,
  edges,
  storyId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  storyId: string;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const [flowNodes, setFlowNodes, onNodesChange] = useNodesState<FlowNode>(
    toFlowNodes(nodes),
  );
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<FlowEdge>(
    toFlowEdges(edges),
  );

  useEffect(() => {
    setFlowNodes(toFlowNodes(nodes));
  }, [nodes, setFlowNodes]);

  useEffect(() => {
    setFlowEdges(toFlowEdges(edges));
  }, [edges, setFlowEdges]);

  const handleStoryStatusChange = useCallback(() => {
    // Story status isn't part of this component's own state (it lives
    // in the sibling StoryHeader, a Server Component) — a refresh picks
    // up the new status along with the stats/frontier count it also owns.
    router.refresh();
  }, [router]);

  useGraphRealtime({
    storyId,
    setFlowNodes,
    setFlowEdges,
    onStoryStatusChange: handleStoryStatusChange,
  });

  // Selection reads from flowNodes (not the `nodes` prop) so a Realtime
  // update to the selected node is reflected immediately in TaskPanel.
  const selectedNode =
    flowNodes.find((n) => n.id === selectedNodeId)?.data ?? null;

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

  // A pulse is presentation state, so it's grafted on here instead of
  // being written into node state: when nothing is pulsing and the goal
  // is unreached this returns the very same array, and React Flow
  // re-renders nothing at all.
  const displayNodes = useMemo(() => {
    if (pulses.size === 0 && !goalReached) return flowNodes;
    return flowNodes.map((node) => {
      const pulse = pulses.get(node.id);
      const reached = goalReached && node.data.type === "GOAL";
      if (!pulse && !reached) return node;
      return { ...node, data: { ...node.data, pulse, reached } };
    });
  }, [flowNodes, pulses, goalReached]);

  // Recomputed from flowNodes on every render (not baked into flowEdges'
  // own state) so a Realtime status change to DONE re-animates that
  // node's outgoing edges immediately, without a separate sync effect.
  //
  // An edge surges when its source just emitted (a task turned DONE, or
  // a node materialised), and also when its *target* just materialised —
  // that second case is what makes an inserted node light up on both
  // sides while still drawing every spark source -> target.
  const displayEdges = useMemo(() => {
    const nodeById = new Map(flowNodes.map((n) => [n.id, n]));
    return flowEdges.map((edge) => {
      const live = isFlowingSource(nodeById.get(edge.source));
      const damped = nodeById.get(edge.target)?.data.status === "BLOCKED";
      const surgeId =
        emitters.get(edge.source) ?? arrivals.get(edge.target) ?? null;

      return {
        ...edge,
        className: live ? "edge-live" : damped ? "edge-damped" : undefined,
        data: { live, damped, surgeId },
      };
    });
  }, [flowEdges, flowNodes, emitters, arrivals]);

  async function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;

    const result = await createEdgeAction({
      storyId,
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
    });

    if (!result.success) {
      showError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full bg-bg">
        <ReactFlow
          nodes={displayNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode="dark"
          fitView
          // Left to itself, fitView shrinks a wide DAG until it fits a
          // phone's width, and the graph ends up a legible-to-nobody
          // sliver floating in empty canvas. Clamping the zoom keeps
          // nodes readable and hands the overflow to panning, which is
          // what the canvas is for.
          fitViewOptions={{ padding: 0.1, minZoom: 0.65, maxZoom: 1.25 }}
          deleteKeyCode={null}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={(connection) => {
            void handleConnect(connection);
          }}
          onNodeClick={(_event, node) => {
            if (node.type === "TASK") {
              setSelectedNodeId(node.id);
            }
          }}
          onNodeDragStop={(_event, node) => {
            void updateNodePositionAction({
              nodeId: node.id,
              x: node.position.x,
              y: node.position.y,
            });
          }}
          onPaneClick={() => setSelectedNodeId(null)}
        >
          <Background color="var(--border-strong)" gap={24} />
        </ReactFlow>
        <GraphToolbar storyId={storyId} />
        {selectedNode && (
          <TaskPanel
            key={selectedNode.id}
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}
