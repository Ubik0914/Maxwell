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
import { GraphMiniMap } from "@/components/graph/GraphMiniMap";
import { TaskPanel } from "@/components/graph/TaskPanel";
import {
  updateNodePositionAction,
  createEdgeAction,
} from "@/features/graph/actions";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { isPendingId, pendingId } from "@/domain/graph/pending";
import { useGraphRealtime } from "@/features/graph/hooks/useGraphRealtime";
import { useGraphPresentation } from "@/features/graph/hooks/useGraphPresentation";
import { layoutGraph } from "@/domain/graph/layout";
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
    // A task the database has not answered for yet has an id nothing
    // can be written against. It is drawn, and it waits — dragging it
    // would save a position for a row that does not exist.
    draggable: !isPendingId(node.id),
  }));
}

function toFlowEdges(edges: GraphEdge[]): FlowEdge[] {
  return edges.map((edge) => ({
    id: edge.id,
    type: "custom",
    source: edge.sourceNodeId,
    target: edge.targetNodeId,
    data: { live: false, waiting: false, surgeId: null },
  }));
}

export function StoryGraph({
  storyId,
  today,
}: {
  storyId: string;
  today: string;
}) {
  const router = useRouter();
  const { showError } = useToast();
  // The story as it should be drawn right now — the server's answer
  // plus anything asked for since. See PendingGraphProvider.
  const pending = usePendingGraph();
  const { nodes, edges } = pending;
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);
  // Only true while an auto-layout is gliding into place — see the
  // .graph-settling rule, which must not apply to ordinary dragging.
  const [isSettling, setIsSettling] = useState(false);
  /**
   * Which connection the pointer is on, so that one can show its
   * controls.
   *
   * Read from the canvas rather than from each edge, because React
   * Flow already maintains a wide invisible path per edge for exactly
   * this and drawing a second one puts a ribbon of pointer target
   * along every line, over whatever it passes across.
   */
  const [hoveredEdgeId, setHoveredEdgeId] = useState<string | null>(null);
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

  // Only the hovered edge is rebuilt; every other one keeps the
  // identity it had, so hovering a line does not re-render the graph.
  const shownEdges = useMemo(
    () =>
      hoveredEdgeId === null
        ? displayEdges
        : displayEdges.map((edge) =>
            edge.id === hoveredEdgeId
              ? { ...edge, data: { ...edge.data!, hovered: true } }
              : edge,
          ),
    [displayEdges, hoveredEdgeId],
  );

  /**
   * Arranges the graph by dependency order and saves where everything
   * landed.
   *
   * The canvas moves first and the writes follow: the arrangement is
   * already computed, so making the user watch a round-trip before
   * seeing it would be latency for nothing. Only nodes that actually
   * moved are written, which on a tidy graph is none of them.
   */
  const handleAutoLayout = useCallback(() => {
    const positions = layoutGraph(
      flowNodes.map((node) => node.data),
      flowEdges.map((edge) => ({
        id: edge.id,
        storyId,
        sourceNodeId: edge.source,
        targetNodeId: edge.target,
      })),
    );

    const moved = flowNodes.filter((node) => {
      const next = positions.get(node.id);
      return next && (next.x !== node.position.x || next.y !== node.position.y);
    });
    if (moved.length === 0) return;

    setIsSettling(true);
    setFlowNodes((prev) =>
      prev.map((node) => {
        const next = positions.get(node.id);
        return next ? { ...node, position: next } : node;
      }),
    );
    // Long enough for the glide to finish; the class only exists to stop
    // the transition applying to ordinary dragging.
    setTimeout(() => setIsSettling(false), 500);

    void Promise.all(
      moved.map((node) => {
        const next = positions.get(node.id)!;
        return updateNodePositionAction({
          nodeId: node.id,
          x: next.x,
          y: next.y,
        });
      }),
    ).then((results) => {
      const failure = results.find((result) => !result.success);
      if (failure && !failure.success) showError(failure.error.message);
    });
  }, [flowNodes, flowEdges, storyId, setFlowNodes, showError]);

  /**
   * Draws the connection, then writes it.
   *
   * A line that only appears once the server agrees makes a drag that
   * landed correctly look like one that missed — and the two are told
   * apart by nothing but a pause. If the write is refused the line is
   * taken back and the reason is said out loud.
   */
  async function handleConnect(connection: Connection) {
    if (!connection.source || !connection.target) return;

    pending.addEdge({
      id: pendingId(),
      storyId,
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
    });

    const result = await createEdgeAction({
      storyId,
      sourceNodeId: connection.source,
      targetNodeId: connection.target,
    });

    if (!result.success) {
      pending.revert();
      showError(result.error.message);
      return;
    }
    router.refresh();
  }

  return (
    <ReactFlowProvider>
      <div
        className={`relative h-full w-full bg-bg ${isSettling ? "graph-settling" : ""}`}
      >
        <ReactFlow
          nodes={displayNodes}
          edges={shownEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode="dark"
          // Out of the bottom-right, which the overview now owns.
          attributionPosition="top-right"
          fitView
          // Left to itself, fitView shrinks a wide DAG until it fits a
          // phone's width, and the graph ends up a legible-to-nobody
          // sliver floating in empty canvas. Clamping the zoom keeps
          // nodes readable and hands the overflow to panning, which is
          // what the canvas is for.
          fitViewOptions={{ padding: 0.1, minZoom: 0.65, maxZoom: 1.25 }}
          /*
           * Two fingers move the canvas, they don't resize it.
           *
           * A two-finger swipe on a trackpad is a scroll, and the
           * default here is for a scroll to zoom — so trying to move
           * along a wide graph kept changing how big it was instead.
           * Panning is what that gesture means everywhere else a canvas
           * or a map is drawn, and zoom is still a pinch, which is what
           * a pinch means everywhere else too.
           */
          panOnScroll
          zoomOnScroll={false}
          deleteKeyCode={null}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onEdgeMouseEnter={(_event, edge) => setHoveredEdgeId(edge.id)}
          onEdgeMouseLeave={() => setHoveredEdgeId(null)}
          onConnect={(connection) => {
            void handleConnect(connection);
          }}
          onNodeClick={(_event, node) => {
            // Same reason it can't be dragged: there is nothing to edit
            // yet. It becomes a real node within a refresh.
            if (node.type === "TASK" && !isPendingId(node.id)) {
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
        {/* Outside <ReactFlow>, unlike React Flow's own MiniMap: this
            one draws the graph itself and positions itself, so it has
            no reason to be a panel the canvas owns. */}
        <GraphMiniMap />
        <GraphToolbar storyId={storyId} onAutoLayout={handleAutoLayout} />
        {selectedNode && (
          <TaskPanel
            key={selectedNode.id}
            node={selectedNode}
            today={today}
            onClose={() => setSelectedNodeId(null)}
          />
        )}
      </div>
    </ReactFlowProvider>
  );
}
