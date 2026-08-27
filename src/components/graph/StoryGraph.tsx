"use client";

import { useEffect, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  useNodesState,
  useEdgesState,
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
import { updateNodePositionAction } from "@/features/graph/actions";

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
  storyId,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  storyId: string;
}) {
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

  const selectedNode = nodes.find((n) => n.id === selectedNodeId) ?? null;

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          fitView
          nodesConnectable={false}
          deleteKeyCode={null}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
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
          <Background />
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
