"use client";

import {
  createContext,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import {
  NOTHING_PENDING,
  applyPending,
  type PendingPatch,
} from "@/domain/graph/pending";

interface PendingGraph {
  /** The story as it should be drawn: the server's, plus what has been
   *  asked for since. */
  nodes: GraphNode[];
  edges: GraphEdge[];
  addNode: (node: GraphNode, edges?: GraphEdge[]) => void;
  removeNode: (id: string) => void;
  addEdge: (edge: GraphEdge) => void;
  removeEdge: (id: string) => void;
  /** Replaces an edge with a task and the two edges around it. */
  spliceEdge: (edgeId: string, node: GraphNode, edges: GraphEdge[]) => void;
  /** Puts everything back, for a write the server refused. */
  revert: () => void;
}

const Context = createContext<PendingGraph | null>(null);

/**
 * The story, as it looks to the person changing it.
 *
 * Every write in this app used to go out and come back before anything
 * moved: you deleted a task and it sat there, added one and nothing
 * appeared, drew a connection and the line showed up when the server
 * agreed. The round-trip is short but it is never zero, and an
 * interface that waits for permission before admitting what you just
 * did feels like it might not have heard you.
 *
 * So the screen changes first and the write follows. What is held here
 * is only the difference — added, removed — laid over whatever the
 * server last said. When a refresh brings a new answer the difference
 * is dropped whole, because the answer already contains it: there is
 * nothing to merge and no way for the two to drift.
 *
 * A refused write calls revert, and the screen goes back to the last
 * thing the server actually agreed to.
 */
export function PendingGraphProvider({
  nodes,
  edges,
  children,
}: {
  nodes: GraphNode[];
  edges: GraphEdge[];
  children: ReactNode;
}) {
  const [patch, setPatch] = useState<PendingPatch>(NOTHING_PENDING);

  /*
   * Fresh server data drops everything pending — it is either in there
   * or it never happened.
   *
   * Adjusted during render rather than in an effect, so the new nodes
   * and the cleared patch land in the same commit. An effect would
   * paint one frame of the server's answer with the optimistic copy
   * still stacked on top of it, which is the one moment a task appears
   * twice.
   */
  const [seen, setSeen] = useState(nodes);
  if (nodes !== seen) {
    setSeen(nodes);
    if (patch !== NOTHING_PENDING) setPatch(NOTHING_PENDING);
  }

  const value = useMemo<PendingGraph>(() => {
    const shown = applyPending(nodes, edges, patch);
    return {
      nodes: shown.nodes,
      edges: shown.edges,
      addNode: (node, newEdges = []) =>
        setPatch((current) => ({
          ...current,
          added: [...current.added, node],
          addedEdges: [...current.addedEdges, ...newEdges],
        })),
      removeNode: (id) =>
        setPatch((current) => ({
          ...current,
          removedNodeIds: [...current.removedNodeIds, id],
        })),
      addEdge: (edge) =>
        setPatch((current) => ({
          ...current,
          addedEdges: [...current.addedEdges, edge],
        })),
      removeEdge: (id) =>
        setPatch((current) => ({
          ...current,
          removedEdgeIds: [...current.removedEdgeIds, id],
        })),
      spliceEdge: (edgeId, node, newEdges) =>
        setPatch((current) => ({
          ...current,
          added: [...current.added, node],
          addedEdges: [...current.addedEdges, ...newEdges],
          removedEdgeIds: [...current.removedEdgeIds, edgeId],
        })),
      revert: () => setPatch(NOTHING_PENDING),
    };
  }, [nodes, edges, patch]);

  return <Context.Provider value={value}>{children}</Context.Provider>;
}

/**
 * Read the story and change it on screen.
 *
 * Throws outside the provider rather than falling back to the server's
 * data: a view that silently stopped being optimistic would look
 * exactly like one that was working.
 */
export function usePendingGraph(): PendingGraph {
  const value = useContext(Context);
  if (!value) {
    throw new Error("usePendingGraph must be used within a PendingGraphProvider");
  }
  return value;
}
