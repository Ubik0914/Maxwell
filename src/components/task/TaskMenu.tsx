"use client";

import { useMemo } from "react";
import type { GraphNode } from "@/domain/graph/types";
import {
  SETTABLE_STATUSES,
  STATUS_LABEL,
  statusOf,
  type SettableStatus,
} from "@/components/task/status";
import { Menu, type MenuItemSpec } from "@/components/ui/Menu";
import type { PressPoint } from "@/hooks/useLongPress";
import { ListIcon, PlusIcon, TrashIcon } from "@/components/icons";

/**
 * What you can do to a task without opening it.
 *
 * The four statuses are listed flat rather than behind a "Status ▸"
 * submenu, because changing state is the reason to open this at all and
 * a submenu would put the common case one hop further away than the
 * rare ones. The current state is marked rather than hidden — a menu
 * that silently drops the option you are already in makes the list
 * change length depending on where you are, and you lose the ability to
 * read your own state off it.
 *
 * BLOCKED is not here at all: it is the Status Engine's, derived from
 * what a task is waiting on, never chosen.
 */
export function TaskMenu({
  task,
  at,
  onClose,
  onOpen,
  onAddNext,
  onStatusChange,
  onDelete,
}: {
  task: GraphNode;
  at: PressPoint;
  onClose: () => void;
  onOpen: () => void;
  onAddNext: () => void;
  onStatusChange: (status: SettableStatus) => void;
  onDelete: () => void;
}) {
  const current = statusOf(task.status);

  const items = useMemo<MenuItemSpec[]>(
    () => [
      {
        key: "open",
        label: "Open",
        icon: <ListIcon className="h-3.5 w-3.5" />,
        onSelect: onOpen,
      },
      {
        key: "next",
        label: "Add next task",
        icon: <PlusIcon className="h-3.5 w-3.5" />,
        onSelect: onAddNext,
      },
      ...SETTABLE_STATUSES.map((status, index) => ({
        key: status,
        label: STATUS_LABEL[status],
        separated: index === 0,
        checked: current === status,
        disabled: current === status,
        onSelect: () => onStatusChange(status),
      })),
      {
        key: "delete",
        label: "Delete",
        icon: <TrashIcon className="h-3.5 w-3.5" />,
        danger: true,
        onSelect: onDelete,
      },
    ],
    [current, onOpen, onAddNext, onStatusChange, onDelete],
  );

  return <Menu at={at} items={items} onClose={onClose} />;
}
