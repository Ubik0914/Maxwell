"use client";

import { useCallback, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GraphNode } from "@/domain/graph/types";
import { deleteTaskAction } from "@/features/graph/actions";
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
export function useTaskActions(serverNodes: GraphNode[]) {
  const router = useRouter();
  const { showError } = useToast();
  const { nodes, changeStatus, flashClass } =
    useTaskStatusMutation(serverNodes);

  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addAfterId, setAddAfterId] = useState<string | null>(null);
  const [deleting, setDeleting] = useState<GraphNode | null>(null);
  const [menu, setMenu] = useState<MenuTarget | null>(null);
  const [, startTransition] = useTransition();

  const byId = useCallback(
    (id: string | null) =>
      id ? (nodes.find((node) => node.id === id) ?? null) : null,
    [nodes],
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
    nodes,
    changeStatus,
    flashClass,

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
