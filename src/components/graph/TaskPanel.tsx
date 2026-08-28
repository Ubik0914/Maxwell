"use client";

import { useCallback, useOptimistic, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { GraphNode, TaskStatus } from "@/domain/graph/types";
import {
  updateTaskAction,
  updateTaskStatusAction,
  deleteTaskAction,
} from "@/features/graph/actions";
import { usePendingGraph } from "@/features/graph/pending-graph";
import { DeleteConfirmDialog } from "@/components/graph/DeleteConfirmDialog";
import { TaskProperties } from "@/components/graph/TaskProperties";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { useOutsideClick } from "@/hooks/useOutsideClick";
import { useSheetDismiss } from "@/hooks/useSheetDismiss";
import { Spinner } from "@/components/Spinner";
import { ChevronDownIcon, CloseIcon, TrashIcon } from "@/components/icons";
import { Markdown } from "@/components/ui/Markdown";

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
 * saves itself on change/blur except Description, which renders as
 * Markdown until you ask to edit it and then saves on an explicit
 * button (per spec: free text shouldn't autosave per keystroke).
 *
 * The parent renders this with `key={node.id}` so switching the
 * selected node remounts the panel with fresh local state, instead of
 * an effect that resyncs state from props.
 */
export function TaskPanel({
  node,
  today,
  onClose,
}: {
  node: GraphNode;
  /** Today, as an ISO date. Handed down rather than read from the
   *  clock: see story-data's todayIso for why. */
  today: string;
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const pending = usePendingGraph();
  const [title, setTitle] = useState(node.title);
  const [description, setDescription] = useState(node.description ?? "");
  const [assigneeId, setAssigneeId] = useState(node.assigneeId ?? "");
  const [priority, setPriority] = useState(node.priority ?? 0);
  const [dueDate, setDueDate] = useState(node.dueDate ?? "");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [isEditingDescription, setIsEditingDescription] = useState(false);
  const [isPending, startTransition] = useTransition();
  const panelRef = useRef<HTMLDivElement>(null);
  // The delete confirmation, when open, owns both ways out — a small
  // window closes before the surface behind it, and a click inside a
  // portalled dialog is not a click outside this panel.
  useEscapeKey(onClose, !isDeleteOpen);
  useOutsideClick(panelRef, onClose, !isDeleteOpen);
  const sheet = useSheetDismiss(onClose);

  /*
   * The status shown is the status just chosen, not the status the
   * server has agreed to yet.
   *
   * A round-trip's worth of a chip that hasn't changed reads as a
   * control that didn't register the press. React drops the optimistic
   * value when the transition ends, so a refusal by the Status Engine
   * (BLOCKED -> IN_PROGRESS) snaps back on its own, and a success is
   * replaced by the same value arriving from the server with no flicker
   * in between.
   */
  const [optimisticStatus, showStatus] = useOptimistic<TaskStatus>(
    node.status ?? "READY",
  );

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

  const changeStatus = useCallback(
    (status: "READY" | "IN_PROGRESS" | "DONE" | "CANCELLED") => {
      startTransition(async () => {
        showStatus(status);
        const result = await updateTaskStatusAction({
          taskId: node.id,
          status,
        });
        if (!result.success) {
          showError(result.error.message);
          return;
        }
        router.refresh();
      });
    },
    [node.id, router, showError, showStatus],
  );

  function handleDelete() {
    // Closed first, gone from the graph second, deleted third: the task
    // is gone as far as this person is concerned the moment they
    // confirm, and holding it on screen for the length of a round-trip
    // only shows them something already untrue.
    setIsDeleteOpen(false);
    onClose();
    pending.removeNode(node.id);
    startTransition(async () => {
      const result = await deleteTaskAction(node.id);
      if (!result.success) {
        pending.revert();
        showError(result.error.message);
        return;
      }
      router.refresh();
    });
  }

  return (
    // Full height on a phone — a task is the whole screen while you're
    // in it — and a panel beside the graph once there's room for both.
    //
    // The corners it keeps are the ones that aren't against an edge of
    // the window: both top corners as a sheet, and only the top-left
    // beside the graph, where the right side is flush with the screen.
    // A square corner floating over the canvas reads as a piece of the
    // page that failed to load.
    <div
      ref={panelRef}
      style={sheet.sheetStyle}
      className="absolute inset-0 z-20 flex flex-col gap-4 overflow-y-auto rounded-t-2xl border-border bg-surface p-4 shadow-[-8px_0_40px_rgba(0,0,0,0.5)] sm:inset-y-0 sm:left-auto sm:w-96 sm:rounded-tr-none sm:border-l sm:p-5"
    >
      {/*
       * On a phone this is a sheet, so it says so: a grab bar, and a
       * chevron rather than an ✕ — you are putting the task back down,
       * not destroying a window. The whole header is the grab area, not
       * just the bar, because a 36px pill is a poor target for a thumb
       * and the bar's job is to say the gesture exists rather than to
       * be the only place it works.
       */}
      <div {...sheet.handleProps}>
        <span
          aria-hidden="true"
          className="mx-auto mb-3 block h-1 w-9 rounded-full bg-border-strong sm:hidden"
        />
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="-ml-1.5 rounded-full p-1.5 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            {/* No size override: `h-5` beside the Icon wrapper's own
                `h-4` is a Tailwind conflict decided by stylesheet order,
                not by which is written last. */}
            <ChevronDownIcon className="sm:hidden" />
            <CloseIcon className="hidden sm:block" />
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
        status={optimisticStatus}
        onStatusChange={changeStatus}
        priority={priority}
        onPriorityChange={(value) => {
          setPriority(value);
          save({ taskId: node.id, priority: value || null });
        }}
        today={today}
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

      {/*
       * Written as Markdown, so shown as Markdown.
       *
       * People put checklists, headings and quotes in a description
       * whether or not anything renders them; the only question was
       * whether they read `- [ ] 未完了のタスク` or a checkbox. Reading
       * is the default state and writing is the one you ask for,
       * because a description is looked at far more often than it is
       * edited — and the raw source is exactly what you want back the
       * moment you do want to change it.
       */}
      <div className="flex flex-1 flex-col gap-2">
        <label htmlFor="panel-description" className="sr-only">
          Description
        </label>
        {isEditingDescription ? (
          <>
            <textarea
              id="panel-description"
              value={description}
              autoFocus
              onChange={(e) => setDescription(e.target.value)}
              rows={6}
              maxLength={5000}
              placeholder="Add a description…"
              className="min-h-32 flex-1 resize-none rounded-md bg-bg/60 p-2 font-mono text-[13px] leading-relaxed text-text placeholder:text-text-faint focus:outline-none"
            />
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  setIsEditingDescription(false);
                  if (description !== (node.description ?? "")) {
                    save({ taskId: node.id, description: description || null });
                  }
                }}
                className="flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-xs font-medium text-inverse transition-opacity hover:bg-accent-hover disabled:opacity-40"
              >
                {isPending && <Spinner className="h-3 w-3" />}
                Save
              </button>
              <button
                type="button"
                onClick={() => {
                  setDescription(node.description ?? "");
                  setIsEditingDescription(false);
                }}
                className="rounded-md px-2 py-1.5 text-xs font-medium text-text-muted transition-colors hover:text-text"
              >
                Cancel
              </button>
            </div>
          </>
        ) : (
          <div
            role="button"
            tabIndex={0}
            aria-label="Edit description"
            onClick={(event) => {
              // A tick, a link, or a word being selected is not a
              // request to edit the source behind it.
              if ((event.target as HTMLElement).closest("a, button")) return;
              if (window.getSelection()?.toString()) return;
              setIsEditingDescription(true);
            }}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                setIsEditingDescription(true);
              }
            }}
            className="min-h-32 flex-1 cursor-text rounded-md focus-visible:outline-none"
          >
            {description ? (
              <Markdown
                onToggleTask={(next) => {
                  // Saved on the spot, not left for the Save button:
                  // ticking a box is a decision of its own, and one
                  // character is not the free text the button guards.
                  setDescription(next);
                  save({ taskId: node.id, description: next });
                }}
              >
                {description}
              </Markdown>
            ) : (
              <p className="text-sm text-text-faint">Add a description…</p>
            )}
          </div>
        )}
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
