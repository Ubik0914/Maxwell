"use client";

import { useState, useTransition, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import type { GraphNode, TaskStatus } from "@/domain/graph/types";
import {
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
} from "@/features/graph/actions";
import { DeleteConfirmDialog } from "@/components/graph/DeleteConfirmDialog";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";
import { CloseIcon, TrashIcon } from "@/components/icons";

const PRIORITY_LABEL: Record<number, string> = {
  1: "Low",
  2: "Medium",
  3: "High",
  4: "Urgent",
};

const STATUS_LABEL: Record<TaskStatus, string> = {
  BLOCKED: "Blocked",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const STATUS_TONE: Record<TaskStatus, string> = {
  BLOCKED: "text-text-faint border-border",
  READY: "text-accent border-accent/40 bg-accent-soft",
  IN_PROGRESS: "text-warning border-warning/40 bg-warning-soft",
  DONE: "text-success border-success/40 bg-success-soft",
  CANCELLED: "text-text-faint border-border",
};

/**
 * A property as a chip: the value is the label. Each one wraps a real
 * form control (a select, a date input) styled to disappear into the
 * pill, so the whole surface stays keyboard- and screen-reader-native
 * and a phone still gets its own OS picker on tap — no custom popover
 * to reimplement badly.
 */
function Chip({
  tone = "border-border text-text-muted",
  dot,
  children,
}: {
  tone?: string;
  dot?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div
      className={`relative flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs transition-colors focus-within:border-accent ${tone}`}
    >
      {dot}
      {children}
    </div>
  );
}

/** Strips a control back to text so the chip's border is the only frame. */
const BARE =
  "cursor-pointer appearance-none bg-transparent text-xs text-current focus:outline-none";

/**
 * The task detail surface.
 *
 * Shaped around the two things that actually get edited — the title and
 * the description — with everything else compressed into one wrapping
 * row of chips between them. The old form put six labelled rows of
 * equal weight on screen, which made a task look like a record to be
 * filled in rather than a thing to be written.
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

  const status = node.status ?? "READY";

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

      <div className="flex flex-col gap-1">
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
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        <Chip
          tone={STATUS_TONE[status]}
          dot={
            <span
              aria-hidden="true"
              className="h-1.5 w-1.5 shrink-0 rounded-full bg-current"
            />
          }
        >
          <label htmlFor="panel-status" className="sr-only">
            Status
          </label>
          <select
            id="panel-status"
            value={status}
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
            className={BARE}
          >
            {status === "BLOCKED" && (
              <option value="BLOCKED" disabled>
                {STATUS_LABEL.BLOCKED}
              </option>
            )}
            <option value="READY">{STATUS_LABEL.READY}</option>
            <option value="IN_PROGRESS">{STATUS_LABEL.IN_PROGRESS}</option>
            <option value="DONE">{STATUS_LABEL.DONE}</option>
            <option value="CANCELLED">{STATUS_LABEL.CANCELLED}</option>
          </select>
        </Chip>

        <Chip tone={priority ? "border-border text-text" : undefined}>
          <label htmlFor="panel-priority" className="sr-only">
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
            className={BARE}
          >
            <option value={0}>Priority</option>
            {Object.entries(PRIORITY_LABEL).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </Chip>

        <Chip tone={dueDate ? "border-border text-text" : undefined}>
          <label htmlFor="panel-due-date" className="sr-only">
            Due date
          </label>
          {/* An empty date input renders the browser's own "mm/dd/yyyy",
              which shouts about a value that isn't set. When there's no
              date the input is laid transparently over the chip instead,
              so the chip reads as a name like the others and still opens
              the picker anywhere on it. */}
          {!dueDate && <span aria-hidden="true">Due date</span>}
          <input
            id="panel-due-date"
            type="date"
            value={dueDate}
            onChange={(e) => {
              setDueDate(e.target.value);
              save({ taskId: node.id, dueDate: e.target.value || null });
            }}
            className={
              dueDate
                ? `${BARE} w-[7.5rem]`
                : `${BARE} absolute inset-0 h-full w-full opacity-0`
            }
          />
        </Chip>

        <Chip tone={assigneeId ? "border-border text-text" : undefined}>
          <label htmlFor="panel-assignee" className="sr-only">
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
            placeholder="Assignee"
            className={`${BARE} w-24 cursor-text placeholder:text-text-muted`}
          />
        </Chip>
      </div>

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
