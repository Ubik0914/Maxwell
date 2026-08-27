"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GraphNode } from "@/domain/graph/types";
import {
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
} from "@/features/graph/actions";
import { DeleteConfirmDialog } from "@/components/graph/DeleteConfirmDialog";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";

const PRIORITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

/**
 * Status goes through updateTaskStatusAction (the Status Engine), which
 * rejects BLOCKED->IN_PROGRESS with TASK_BLOCKED — everything else here
 * saves itself on change/blur except Description, which uses an explicit
 * Save button (per spec: free text shouldn't autosave per keystroke).
 *
 * The parent renders this with `key={node.id}` so switching the selected
 * node remounts the panel with fresh local state, instead of an effect
 * that resyncs state from props.
 */
export function TaskPanel({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? "");
  const [assigneeId, setAssigneeId] = useState(node.assigneeId ?? "");
  const [priority, setPriority] = useState(node.priority ?? 0);
  const [dueDate, setDueDate] = useState(node.dueDate ?? "");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  // The delete confirmation, when open, owns Escape instead — a small
  // window closes before the surface behind it.
  useEscapeKey(onClose, !isDeleteOpen);

  function save(patch: Parameters<typeof updateTaskAction>[0]) {
    startTransition(async () => {
      const result = await updateTaskAction(patch);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTaskAction(node.id);
      if (!result.success) {
        showError(result.error.message);
        setIsDeleteOpen(false);
        return;
      }
      setIsDeleteOpen(false);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="absolute top-0 right-0 flex h-full w-80 flex-col gap-4 overflow-y-auto border-l border-border bg-surface p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-text">{node.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-text-faint hover:text-text"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-title"
          className="text-xs font-medium tracking-wide text-text-faint uppercase"
        >
          Title
        </label>
        <input
          id="panel-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          onBlur={() =>
            title.trim() &&
            title !== node.title &&
            save({ taskId: node.id, title })
          }
          maxLength={200}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-status"
          className="text-xs font-medium tracking-wide text-text-faint uppercase"
        >
          Status
        </label>
        <select
          id="panel-status"
          value={node.status ?? "READY"}
          onChange={(e) => {
            const value = e.target.value as
              | "READY"
              | "IN_PROGRESS"
              | "DONE"
              | "CANCELLED";
            startTransition(async () => {
              const result = await updateTaskStatusAction({
                taskId: node.id,
                status: value,
              });
              if (!result.success) {
                showError(result.error.message);
                return;
              }
              router.refresh();
            });
          }}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          {node.status === "BLOCKED" && (
            <option value="BLOCKED" disabled>
              Blocked
            </option>
          )}
          <option value="READY">Ready</option>
          <option value="IN_PROGRESS">In progress</option>
          <option value="DONE">Done</option>
          <option value="CANCELLED">Cancelled</option>
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-description"
          className="text-xs font-medium tracking-wide text-text-faint uppercase"
        >
          Description
        </label>
        <textarea
          id="panel-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={5000}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
        <button
          type="button"
          onClick={() =>
            save({ taskId: node.id, description: description || null })
          }
          disabled={isPending || description === (node.description ?? "")}
          className="flex items-center gap-1.5 self-start rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-inverse hover:bg-accent-hover disabled:opacity-50"
        >
          {isPending && <Spinner className="h-3 w-3" />}
          Save
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-assignee"
          className="text-xs font-medium tracking-wide text-text-faint uppercase"
        >
          Assignee
        </label>
        <input
          id="panel-assignee"
          value={assigneeId}
          onChange={(e) => setAssigneeId(e.target.value)}
          onBlur={() =>
            assigneeId !== (node.assigneeId ?? "") &&
            save({ taskId: node.id, assigneeId: assigneeId || null })
          }
          placeholder="User ID"
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-priority"
          className="text-xs font-medium tracking-wide text-text-faint uppercase"
        >
          Priority
        </label>
        <select
          id="panel-priority"
          value={priority}
          onChange={(e) => {
            const value = Number(e.target.value);
            setPriority(value);
            save({ taskId: node.id, priority: value || null });
          }}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        >
          <option value={0}>—</option>
          {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
            <option key={value} value={value}>
              {label}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-due-date"
          className="text-xs font-medium tracking-wide text-text-faint uppercase"
        >
          Due Date
        </label>
        <input
          id="panel-due-date"
          type="date"
          value={dueDate}
          onChange={(e) => {
            setDueDate(e.target.value);
            save({ taskId: node.id, dueDate: e.target.value || null });
          }}
          className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </div>

      <button
        type="button"
        onClick={() => setIsDeleteOpen(true)}
        className="mt-auto rounded-md border border-danger/40 px-4 py-2 text-sm font-medium text-danger hover:bg-danger-soft"
      >
        Delete Task
      </button>

      {isDeleteOpen && (
        <DeleteConfirmDialog
          title={node.title}
          isPending={isPending}
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteOpen(false)}
        />
      )}
    </div>
  );
}
