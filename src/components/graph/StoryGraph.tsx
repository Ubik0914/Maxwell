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
  type Edge,
  type EdgeTypes,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode, GraphEdge } from "@/domain/graph/types";
import type { FlowNode, FlowNodeData } from "@/components/graph/types";
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

function toFlowEdges(edges: GraphEdge[]): Edge[] {
  return edges.map((edge) => ({
    id: edge.id,
    type: "custom",
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
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
  const [flowEdges, setFlowEdges, onEdgesChange] = useEdgesState<Edge>(
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

  // Recomputed from flowNodes on every render (not baked into flowEdges'
  // own state) so a Realtime status change to DONE re-animates that
  // node's outgoing edges immediately, without a separate sync effect.
  const displayEdges = useMemo(() => {
    const nodeById = new Map(flowNodes.map((n) => [n.id, n]));
    return flowEdges.map((edge) => ({
      ...edge,
      animated: isFlowingSource(nodeById.get(edge.source)),
    }));
  }, [flowEdges, flowNodes]);

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
          nodes={flowNodes}
          edges={displayEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode="dark"
          fitView
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
