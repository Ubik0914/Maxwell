"use client";

import { useMemo, useState } from "react";
import {
  ReactFlow,
  ReactFlowProvider,
  Background,
  type EdgeTypes,
  type Node,
  type NodeTypes,
} from "@xyflow/react";
import "@xyflow/react/dist/style.css";
import type { StoryLink } from "@/repositories/story.repository";
import type { FlowEdge, FlowNode } from "@/components/graph/types";
import { layoutLanes } from "@/domain/graph/lanes";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { StartNode } from "@/components/graph/nodes/StartNode";
import { TaskNode } from "@/components/graph/nodes/TaskNode";
import { GoalNode } from "@/components/graph/nodes/GoalNode";
import { StoryLaneNode } from "@/components/graph/nodes/StoryLaneNode";
import { CustomEdge } from "@/components/graph/edges/CustomEdge";
import { TaskPanel } from "@/components/graph/TaskPanel";

const nodeTypes: NodeTypes = {
  START: StartNode,
  TASK: TaskNode,
  GOAL: GoalNode,
  STORY_LANE: StoryLaneNode,
};

const edgeTypes: EdgeTypes = {
  custom: CustomEdge,
};

/**
 * Every story in the workspace on one canvas, one lane each.
 *
 * The same nodes and the same conduits the story graph draws, arranged
 * by layoutLanes — so a workspace can be read the way a story can, and
 * the answer to "where is the work" is a glance rather than a walk
 * through the drawer opening each story in turn.
 *
 * It does not write positions. A lane's coordinates are this canvas's
 * arithmetic, not the story's own (see lanes.ts), so a node dragged
 * here would be saved somewhere its story never put it — dragging is
 * off, and the story's own graph remains the place a graph is arranged.
 * Connecting is off for the same reason it would be wrong: an edge
 * belongs to one story, and two nodes side by side here may be in two.
 *
 * What it does keep is the panel. Opening a task from the overview and
 * changing its title, its description or its status writes exactly what
 * it writes anywhere else, because none of those is a fact about which
 * story the task is in.
 */
export function AllStoriesGraph({
  stories,
  today,
}: {
  stories: StoryLink[];
  today: string;
}) {
  const { nodes, edges } = usePendingGraph();
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const storyIds = useMemo(() => stories.map((story) => story.id), [stories]);

  const flowNodes = useMemo<Node[]>(() => {
    const { positions, lanes } = layoutLanes(storyIds, nodes);
    const completed = new Set(
      stories.filter((story) => story.status === "COMPLETED").map((s) => s.id),
    );
    const taskCounts = new Map<string, number>();
    for (const node of nodes) {
      if (node.type !== "TASK") continue;
      taskCounts.set(node.storyId, (taskCounts.get(node.storyId) ?? 0) + 1);
    }

    const labels: Node[] = lanes.map((lane) => {
      const story = stories.find((candidate) => candidate.id === lane.storyId)!;
      return {
        id: `lane-${lane.storyId}`,
        type: "STORY_LANE",
        position: { x: 0, y: lane.top },
        draggable: false,
        selectable: false,
        data: {
          storyId: story.id,
          title: story.title,
          status: story.status,
          taskCount: taskCounts.get(story.id) ?? 0,
        },
      };
    });

    const drawn: FlowNode[] = nodes
      .filter((node) => positions.has(node.id))
      .map((node) => ({
        id: node.id,
        type: node.type,
        position: positions.get(node.id)!,
        draggable: false,
        data: {
          ...node,
          readOnly: true,
          // The goal is lit by the story's own status, which is decided
          // by the same rule the story graph derives it from — so a
          // goal reads the same here as it does in there.
          reached: node.type === "GOAL" && completed.has(node.storyId),
        },
      }));

    return [...labels, ...drawn];
  }, [nodes, stories, storyIds]);

  /*
   * The conduits, lit by what is behind them.
   *
   * Live and waiting are read straight off the two ends rather than
   * from useGraphPresentation: that hook also runs the energy flow,
   * which is a story's own animation — a surge crossing eleven stories
   * at once would be motion about nothing. What survives is the part
   * that says something at a glance: which paths are carrying, and
   * where each one stops.
   */
  const flowEdges = useMemo<FlowEdge[]>(() => {
    const byId = new Map(nodes.map((node) => [node.id, node]));
    return edges.map((edge) => {
      const source = byId.get(edge.sourceNodeId);
      const target = byId.get(edge.targetNodeId);
      return {
        id: edge.id,
        type: "custom",
        source: edge.sourceNodeId,
        target: edge.targetNodeId,
        data: {
          live: source?.type === "START" || source?.status === "DONE",
          waiting: target?.status === "BLOCKED",
          surgeId: null,
        },
      };
    });
  }, [nodes, edges]);

  const selectedNode =
    nodes.find((node) => node.id === selectedNodeId) ?? null;

  return (
    <ReactFlowProvider>
      <div className="relative h-full w-full bg-bg">
        <ReactFlow
          nodes={flowNodes}
          edges={flowEdges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          colorMode="dark"
          attributionPosition="top-right"
          fitView
          // Wider than a story's own view allows: this is a canvas you
          // pull back from to see the shape of a workspace, and clamping
          // it at the story graph's floor would make "everything" the
          // one thing it could not show.
          fitViewOptions={{ padding: 0.12, minZoom: 0.25, maxZoom: 1 }}
          minZoom={0.15}
          nodesDraggable={false}
          nodesConnectable={false}
          elementsSelectable={false}
          panOnScroll
          zoomOnScroll={false}
          deleteKeyCode={null}
          onNodeClick={(_event, node) => {
            // A lane's name is a link to that story; everything else is
            // a node with a panel behind it.
            if (node.type === "STORY_LANE") return;
            setSelectedNodeId(node.id);
          }}
          onPaneClick={() => setSelectedNodeId(null)}
        >
          <Background color="var(--border-strong)" gap={24} />
        </ReactFlow>

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
