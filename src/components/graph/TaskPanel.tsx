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
import { TaskProperties } from "@/components/graph/TaskProperties";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";
import { CloseIcon, TrashIcon } from "@/components/icons";

/**
 * The task detail surface.
 *
 * Shaped around the two things that actually get edited — the title and
 * the description — with everything else compressed into one wrapping
 * row of chips between them (TaskProperties). The old form put six
 * labelled rows of equal weight on screen, which made a task look like
 * a record to be filled in rather than a thing to be written.
 *
 * Status goes through updateTaskStatusAction (the Status Engine), which
 * rejects BLOCKED->IN_PROGRESS with TASK_BLOCKED — everything else here
 * saves itself on change/blur except Description, which saves on an
 * explicit button (per spec: free text shouldn't autosave per
 * keystroke).
 *
 * The parent renders this with `key={node.id}` so switching the
 * selected node remounts the panel with fresh local state, instead of
 * an effect that resyncs state from props.
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

  function changeStatus(
    status: "READY" | "IN_PROGRESS" | "DONE" | "CANCELLED",
  ) {
    startTransition(async () => {
      const result = await updateTaskStatusAction({ taskId: node.id, status });
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
    // Full height on a phone — a task is the whole screen while you're
    // in it — and a panel beside the graph once there's room for both.
    <div className="absolute inset-0 z-20 flex flex-col gap-4 overflow-y-auto border-border bg-surface p-4 shadow-[-8px_0_40px_rgba(0,0,0,0.5)] sm:inset-y-0 sm:left-auto sm:w-96 sm:border-l sm:p-5">
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="-ml-1.5 rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
        >
          <CloseIcon />
        </button>
        <button
          type="button"
          onClick={() => setIsDeleteOpen(true)}
          aria-label="Delete task"
          title="Delete task"
          className="-mr-1.5 rounded-full p-1.5 text-text-faint transition-colors hover:bg-danger-soft hover:text-danger"
        >
          <TrashIcon />
        </button>
      </div>

      <label htmlFor="panel-title" className="sr-only">
        Title
      </label>
      <textarea
        id="panel-title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        onBlur={() =>
          title.trim() &&
          title !== node.title &&
          save({ taskId: node.id, title })
        }
        rows={2}
        maxLength={200}
        className="resize-none bg-transparent text-xl leading-snug font-semibold text-text focus:outline-none"
      />

      <TaskProperties
        status={node.status ?? "READY"}
        onStatusChange={changeStatus}
        priority={priority}
        onPriorityChange={(value) => {
          setPriority(value);
          save({ taskId: node.id, priority: value || null });
        }}
        dueDate={dueDate}
        onDueDateChange={(value) => {
          setDueDate(value);
          save({ taskId: node.id, dueDate: value || null });
        }}
        assigneeId={assigneeId}
        onAssigneeChange={setAssigneeId}
        onAssigneeCommit={() =>
          assigneeId !== (node.assigneeId ?? "") &&
          save({ taskId: node.id, assigneeId: assigneeId || null })
        }
      />

      <hr className="border-border" />

      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="panel-description" className="sr-only">
          Description
        </label>
        <textarea
          id="panel-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          rows={6}
          maxLength={5000}
          placeholder="Add a description…"
          className="min-h-32 flex-1 resize-none bg-transparent text-sm leading-relaxed text-text placeholder:text-text-faint focus:outline-none"
        />
        <button
          type="button"
          onClick={() =>
            save({ taskId: node.id, description: description || null })
          }
          disabled={isPending || description === (node.description ?? "")}
          className="flex items-center gap-1.5 self-start rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-inverse transition-opacity hover:bg-accent-hover disabled:opacity-40"
        >
          {isPending && <Spinner className="h-3 w-3" />}
          Save
        </button>
      </div>

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
