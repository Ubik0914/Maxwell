"use client";

import { useState } from "react";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { WeekdayPicker } from "@/components/routine/WeekdayPicker";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { EVERY_DAY } from "@/domain/routine/schedule";
import {
  createRoutineAction,
  updateRoutineAction,
} from "@/features/routine/actions";
import type { RoutineListItem } from "@/repositories/routine.repository";

/**
 * One dialog for making a routine and for editing one.
 *
 * The two forms have the same three fields and differ only in what
 * they start with and which action they end in, so they are one
 * component: two copies would be the same form twice, free to drift.
 *
 * There is no `useActionState` here, unlike the story dialog, because
 * the schedule is not a form field — a bitmask has no sensible shape
 * in FormData, and hiding one in an <input type="hidden"> would mean
 * the picker and the form each holding half of the same value.
 */
export function RoutineDialog({
  workspaceId,
  routine,
  onClose,
  onSaved,
}: {
  workspaceId: string;
  /** The routine being edited, or undefined when making a new one. */
  routine?: RoutineListItem;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(routine?.title ?? "");
  const [description, setDescription] = useState(routine?.description ?? "");
  const [weekdays, setWeekdays] = useState(routine?.weekdays ?? EVERY_DAY);
  const [error, setError] = useState<string | null>(null);
  const [isPending, setIsPending] = useState(false);

  useEscapeKey(onClose, true, { exclusive: true });

  async function save(event: React.FormEvent) {
    event.preventDefault();
    if (isPending) return;

    setIsPending(true);
    setError(null);

    const trimmed = description.trim();
    const result = routine
      ? await updateRoutineAction({
          routineId: routine.id,
          title,
          description: trimmed === "" ? null : trimmed,
          weekdays,
        })
      : await createRoutineAction({
          workspaceId,
          title,
          description: trimmed === "" ? undefined : trimmed,
          weekdays,
        });

    setIsPending(false);

    if (!result.success) {
      setError(result.error.message);
      return;
    }

    onSaved();
    onClose();
  }

  return (
    <Modal
      title={routine ? "Edit routine" : "New routine"}
      subtitle="Something that comes back, on the days you choose."
      onClose={onClose}
    >
      <form onSubmit={save} className="flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label
            htmlFor="routine-title"
            className="text-sm font-medium text-text-muted"
          >
            Title *
          </label>
          <input
            id="routine-title"
            type="text"
            required
            autoFocus
            maxLength={200}
            value={title}
            onChange={(event) => setTitle(event.target.value)}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-1">
          <label
            htmlFor="routine-description"
            className="text-sm font-medium text-text-muted"
          >
            Description
          </label>
          <textarea
            id="routine-description"
            rows={2}
            maxLength={5000}
            value={description}
            onChange={(event) => setDescription(event.target.value)}
            className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
          />
        </div>

        <div className="flex flex-col gap-2">
          <span className="text-sm font-medium text-text-muted">Days *</span>
          <WeekdayPicker
            value={weekdays}
            onChange={setWeekdays}
            disabled={isPending}
          />
        </div>

        {error && (
          <p role="alert" className="text-sm text-danger select-text">
            {error}
          </p>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-muted hover:text-text"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={isPending || title.trim() === ""}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent-hover disabled:opacity-50"
          >
            {isPending && <Spinner />}
            {routine ? "Save" : "Create"}
          </button>
        </div>
      </form>
    </Modal>
  );
}
