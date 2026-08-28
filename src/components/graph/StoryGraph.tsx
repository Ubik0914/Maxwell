"use client";

import { useCallback, useEffect, useState } from "react";
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
import { useGraphPresentation } from "@/features/graph/hooks/useGraphPresentation";
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

  const { displayNodes, displayEdges } = useGraphPresentation({
    flowNodes,
    flowEdges,
    storyId,
  });

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
