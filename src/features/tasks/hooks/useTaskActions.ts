"use client";

import { useCallback, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GraphNode } from "@/domain/graph/types";
import {
  deleteTaskAction,
  reorderTasksAction,
} from "@/features/graph/actions";
import { reorderWithin } from "@/domain/graph/reorder";
import { sortTasks } from "@/domain/graph/task-order";
import { onlyTasks } from "@/features/tasks/filter";
import { useToast } from "@/components/Toast";
import { useTaskStatusMutation } from "@/features/tasks/hooks/useTaskStatusMutation";
import type { PressPoint } from "@/hooks/useLongPress";
import type { SettableStatus } from "@/components/task/status";

export interface MenuTarget {
  task: GraphNode;
  at: PressPoint;
}

/**
 * Everything the list and the board can do to a task, and the state
 * that goes with it.
 *
 * The two views draw completely differently and behave identically:
 * open a task, change its state, add what comes after it, delete it,
 * and a long press on any of those rows or cards brings the same menu.
 * Keeping that here rather than in each view is what stops one of them
 * quietly growing an action the other doesn't have.
 *
 * `nodes` is the optimistic graph (see useTaskStatusMutation), so a
 * change made from the menu re-sorts the list the same instant as one
 * made from the status chip.
 */
export function useTaskActions(serverNodes: GraphNode[], storyId: string) {
  const router = useRouter();
  const { showError } = useToast();
  const { nodes, changeStatus, flashClass } =
    useTaskStatusMutation(serverNodes);
  /**
   * The manual rank applied locally, so a dropped card stays where it
   * was dropped instead of snapping back for a round-trip. Cleared when
   * the server's own order arrives, exactly like the optimistic status.
   */
  const [localOrder, setLocalOrder] = useState<string[] | null>(null);

  /*
   * Drop the local order the moment fresh server data arrives.
   *
   * Adjusted during render rather than in an effect, so the new nodes
   * and the cleared override land in the same commit — an effect would
   * paint one frame of the server's order underneath a stale local one.
   */
  const [seenNodes, setSeenNodes] = useState(serverNodes);
  if (serverNodes !== seenNodes) {
    setSeenNodes(serverNodes);
    setLocalOrder(null);
  }

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addAfterId, setAddAfterId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GraphNode | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [, startTransition] = useTransition();

  // The graph as it should be drawn: the server's, plus any status
  // change and any drop still in flight.
  const shownNodes = useMemo(() => {
    if (!localOrder) return nodes;
    const rank = new Map(localOrder.map((id, index) => [id, index]));
    return nodes.map((node) =>
      rank.has(node.id) ? { ...node, sortOrder: rank.get(node.id)! } : node,
    );
  }, [nodes, localOrder]);

  const byId = useCallback(
    (id: string | null) =>
      id ? (shownNodes.find((node) => node.id === id) ?? null) : null,
    [shownNodes],
  );

  /**
   * A card was dropped at `index` within `visible` — an ordered view of
   * some of the story's tasks (one board column, or the list as it is
   * currently filtered).
   *
   * The view moves first and the write follows, like every other
   * mutation here: a card that springs back to where it came from for
   * the length of a round-trip reads as a drop that failed.
   */
  const reorder = useCallback(
    (movedId: string, visible: GraphNode[], index: number) => {
      const ordered = sortTasks(onlyTasks(shownNodes), "manual");
      const before = ordered.map((task) => task.id);
      const after = reorderWithin(ordered, visible, movedId, index);
      // Dropped back where it already was. Writing the same order would
      // be a round-trip and a refresh for nothing.
      if (before.every((id, i) => id === after[i])) return;

      setLocalOrder(after);
      startTransition(async () => {
        const result = await reorderTasksAction({ storyId, taskIds: after });
        if (!result.success) {
          showError(result.error.message);
          setLocalOrder(null);
          return;
        }
        router.refresh();
      });
    },
    [shownNodes, storyId, router, showError],
  );

  const openMenu = useCallback((task: GraphNode, at: PressPoint) => {
    setMenu({ task, at });
  }, []);

  const confirmDelete = useCallback(() => {
    const task = deleting;
    if (!task) return;
    // Dismissed first, deleted second — the row is gone as far as this
    // person is concerned the moment they confirm.
    setDeleting(null);
    if (selectedId === task.id) setSelectedId(null);
    startTransition(async () => {
      const result = await deleteTaskAction(task.id);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      router.refresh();
    });
  }, [deleting, selectedId, router, showError]);

  return {
    nodes: shownNodes,
    changeStatus,
    flashClass,
    reorder,

    selected: byId(selectedId),
    selectedId,
    select: setSelectedId,

    addAfter: byId(addAfterId),
    askAddAfter: setAddAfterId,

    deleting,
    askDelete: setDeleting,
    confirmDelete,

    menu,
    openMenu,
    closeMenu: useCallback(() => setMenu(null), []),

    /** The one set of menu handlers, bound to whichever task opened it. */
    menuHandlers: useCallback(
      (task: GraphNode) => ({
        onOpen: () => setSelectedId(task.id),
        onAddNext: () => setAddAfterId(task.id),
        onStatusChange: (status: SettableStatus) =>
          changeStatus(task.id, status),
        onDelete: () => setDeleting(task),
      }),
      [changeStatus],
    ),
  };
}
