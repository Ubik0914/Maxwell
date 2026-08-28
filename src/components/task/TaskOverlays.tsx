"use client";

import type { GraphEdge, GraphNode } from "@/domain/graph/types";
import type { useTaskActions } from "@/features/tasks/hooks/useTaskActions";
import { TaskMenu } from "@/components/task/TaskMenu";
import { AddNextTaskDialog } from "@/components/task/AddNextTaskDialog";
import { TaskPanel } from "@/components/graph/TaskPanel";
import { DeleteConfirmDialog } from "@/components/graph/DeleteConfirmDialog";

/**
 * The four surfaces that can sit over a task view: the long-press menu,
 * the detail panel, "add next", and the delete confirmation.
 *
 * Identical in the list and on the board, so they are written once. The
 * panel is `absolute inset-0` and needs a positioned ancestor, which is
 * each view's own root — everything else portals to the body.
 */
export function TaskOverlays({
  actions,
  edges,
}: {
  actions: ReturnType<typeof useTaskActions>;
  edges: GraphEdge[];
}) {
  const { menu, selected, addAfter, deleting } = actions;

  return (
    <>
      {menu && (
        <TaskMenu
          key={menu.task.id}
          task={menu.task}
          at={menu.at}
          onClose={actions.closeMenu}
          {...actions.menuHandlers(menu.task)}
        />
      )}

      {addAfter && (
        <AddNextTaskDialog
          source={addAfter}
          nodes={actions.nodes as GraphNode[]}
          edges={edges}
          onClose={() => actions.askAddAfter(null)}
        />
      )}

      {deleting && (
        <DeleteConfirmDialog
          title={deleting.title}
          isPending={false}
          onConfirm={actions.confirmDelete}
          onCancel={() => actions.askDelete(null)}
        />
      )}

      {selected && (
        <TaskPanel
          key={selected.id}
          node={selected}
          onClose={() => actions.select(null)}
        />
      )}
    </>
  );
}
