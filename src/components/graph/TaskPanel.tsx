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
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? "");
  const [assigneeId, setAssigneeId] = useState(node.assigneeId ?? "");
  const [priority, setPriority] = useState(node.priority ?? 0);
  const [dueDate, setDueDate] = useState(node.dueDate ?? "");
  const [error, setError] = useState<string | null>(null);
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  function save(patch: Parameters<typeof updateTaskAction>[0]) {
    startTransition(async () => {
      const result = await updateTaskAction(patch);
      if (!result.success) {
        setError(result.error.message);
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  function handleDelete() {
    startTransition(async () => {
      const result = await deleteTaskAction(node.id);
      if (!result.success) {
        setError(result.error.message);
        setIsDeleteOpen(false);
        return;
      }
      setIsDeleteOpen(false);
      onClose();
      router.refresh();
    });
  }

  return (
    <div className="absolute top-0 right-0 flex h-full w-80 flex-col gap-4 overflow-y-auto border-l border-gray-200 bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{node.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-title"
          className="text-xs font-medium tracking-wide text-gray-500 uppercase"
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
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-status"
          className="text-xs font-medium tracking-wide text-gray-500 uppercase"
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
                setError(result.error.message);
                return;
              }
              setError(null);
              router.refresh();
            });
          }}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
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
          className="text-xs font-medium tracking-wide text-gray-500 uppercase"
        >
          Description
        </label>
        <textarea
          id="panel-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={3}
          maxLength={5000}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
        <button
          type="button"
          onClick={() =>
            save({ taskId: node.id, description: description || null })
          }
          disabled={isPending || description === (node.description ?? "")}
          className="self-start rounded-md bg-gray-900 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-50"
        >
          Save
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-assignee"
          className="text-xs font-medium tracking-wide text-gray-500 uppercase"
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
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label
          htmlFor="panel-priority"
          className="text-xs font-medium tracking-wide text-gray-500 uppercase"
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
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
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
          className="text-xs font-medium tracking-wide text-gray-500 uppercase"
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
          className="rounded-md border border-gray-300 px-3 py-2 text-sm focus:border-gray-900 focus:outline-none"
        />
      </div>

      {error && (
        <p role="alert" className="text-sm text-red-600">
          {error}
        </p>
      )}

      <button
        type="button"
        onClick={() => setIsDeleteOpen(true)}
        className="mt-auto rounded-md border border-red-200 px-4 py-2 text-sm font-medium text-red-600 hover:bg-red-50"
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
