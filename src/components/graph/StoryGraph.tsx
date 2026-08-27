"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type Edge,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { GraphNode, GraphEdge } from "@/domain/graph/types";
import type { FlowNode, FlowNodeData } from "@/components/graph/types";
import { StartNode } from "@/components/graph/nodes/StartNode";
import { TaskNode } from "@/components/graph/nodes/TaskNode";
import { GoalNode } from "@/components/graph/nodes/GoalNode";
import { GraphToolbar } from "@/components/graph/GraphToolbar";
import { TaskPanel } from "@/components/graph/TaskPanel";

const nodeTypes: NodeTypes = {
  START: StartNode,
  TASK: TaskNode,
  GOAL: GoalNode,
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
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
  }));
}

export function StoryGraph({
  nodes,
  edges,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
}) {
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  const flowNodes = useMemo(() => toFlowNodes(nodes), [nodes]);
  const flowEdges = useMemo(() => toFlowEdges(edges), [edges]);
  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          nodesDraggable={false}
          nodesConnectable={false}
          onNodeClick={(_event, node) => {
            if (node.type === "TASK") {
              setSelectedNodeId(node.id);
            }
          }}
          onPaneClick={() => setSelectedNodeId(null)}
        >
          <Background />
        </ReactFlow>
        <GraphToolbar />
        {selectedNode && (
          <TaskPanel
            node={selectedNode}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}
