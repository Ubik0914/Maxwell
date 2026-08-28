"use client";

import { useEffect } from "react";
import type { Dispatch, SetStateAction } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Database } from "@/types/database";
import type { GraphNode } from "@/domain/graph/types";
import type {
  FlowEdge,
  FlowNode,
  FlowNodeData,
} from "@/components/graph/types";

type NodeRow = Database["dag"]["Tables"]["nodes"]["Row"];
type EdgeRow = Database["dag"]["Tables"]["edges"]["Row"];
type StoryStatus = "ACTIVE" | "COMPLETED" | "ARCHIVED";

function nodeRowToFlowNode(row: NodeRow): FlowNode {
  const data: GraphNode = {
    id: row.id,
    storyId: row.story_id,
    type: row.type,
    title: row.title,
    description: row.description,
    status: row.status,
    assigneeId: row.assignee_id,
    priority: row.priority as GraphNode["priority"],
    dueDate: row.due_date,
    positionX: row.position_x,
    positionY: row.position_y,
    sortOrder: row.sort_order,
  };

  return {
    id: row.id,
    type: row.type,
    position: { x: row.position_x, y: row.position_y },
    data: data as FlowNodeData,
  };
}

function edgeRowToFlowEdge(row: EdgeRow): FlowEdge {
  return {
    id: row.id,
    type: "custom",
    source: row.source_node_id,
    target: row.target_node_id,
    // Placeholder only: StoryGraph derives the real energy state for
    // every edge on each render (see its displayEdges).
    data: { live: false, waiting: false, surgeId: null },
  };
}

/**
 * Subscribes to `story:{storyId}` for live nodes/edges/stories changes
 * (Postgres Changes) and applies them directly to the caller's React
 * Flow state: upsert by id for INSERT/UPDATE, remove by id for DELETE —
 * never a full graph re-fetch. Removes the channel on unmount/storyId
 * change so a re-render never leaves a duplicate subscription behind.
 */
export function useGraphRealtime({
  storyId,
  setFlowNodes,
  setFlowEdges,
  onStoryStatusChange,
}: {
  storyId: string;
  setFlowNodes: Dispatch<SetStateAction<FlowNode[]>>;
  setFlowEdges: Dispatch<SetStateAction<FlowEdge[]>>;
  onStoryStatusChange: (status: StoryStatus) => void;
}) {
  useEffect(() => {
    const supabase = createClient();

    const channel = supabase
      .channel(`story:${storyId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "dag",
          table: "nodes",
          filter: `story_id=eq.${storyId}`,
        },
        (payload) => {
          const flowNode = nodeRowToFlowNode(payload.new as NodeRow);
          setFlowNodes((prev) =>
            prev.some((n) => n.id === flowNode.id)
              ? prev
              : [...prev, flowNode],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "dag",
          table: "nodes",
          filter: `story_id=eq.${storyId}`,
        },
        (payload) => {
          const flowNode = nodeRowToFlowNode(payload.new as NodeRow);
          setFlowNodes((prev) =>
            prev.map((n) => (n.id === flowNode.id ? flowNode : n)),
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "dag",
          table: "nodes",
          filter: `story_id=eq.${storyId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setFlowNodes((prev) => prev.filter((n) => n.id !== deletedId));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "dag",
          table: "edges",
          filter: `story_id=eq.${storyId}`,
        },
        (payload) => {
          const flowEdge = edgeRowToFlowEdge(payload.new as EdgeRow);
          setFlowEdges((prev) =>
            prev.some((e) => e.id === flowEdge.id)
              ? prev
              : [...prev, flowEdge],
          );
        },
      )
      .on(
        "postgres_changes",
        {
          event: "DELETE",
          schema: "dag",
          table: "edges",
          filter: `story_id=eq.${storyId}`,
        },
        (payload) => {
          const deletedId = (payload.old as { id: string }).id;
          setFlowEdges((prev) => prev.filter((e) => e.id !== deletedId));
        },
      )
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "dag",
          table: "stories",
          filter: `id=eq.${storyId}`,
        },
        (payload) => {
          const row = payload.new as { status: StoryStatus };
          onStoryStatusChange(row.status);
        },
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [storyId, setFlowNodes, setFlowEdges, onStoryStatusChange]);
}
