"use client";

import { useCallback, useEffect, useState } from "react";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { DeleteConfirmDialog } from "@/components/graph/DeleteConfirmDialog";
import { RoutineDialog } from "@/components/routine/RoutineDialog";
import { RoutineRow } from "@/components/routine/RoutineRow";
import { PlusIcon } from "@/components/icons";
import { useToast } from "@/components/Toast";
import { useToday } from "@/hooks/useToday";
import {
  deleteRoutineAction,
  listRoutinesAction,
  setRoutineCompletionAction,
  updateRoutineAction,
} from "@/features/routine/actions";
import type { RoutineListItem } from "@/repositories/routine.repository";

/**
 * Today's routines, and the ones that are not today's.
 *
 * Three groups rather than one list, because the question the screen
 * answers is "what is left today" and a Sunday-only routine on a
 * Tuesday is not part of the answer. It is still shown — a schedule
 * you cannot see is one you cannot correct — just under a heading that
 * says it is not being asked for.
 */
function group(routines: RoutineListItem[]) {
  return {
    today: routines.filter((routine) => routine.active && routine.dueToday),
    otherDays: routines.filter(
      (routine) => routine.active && !routine.dueToday,
    ),
    paused: routines.filter((routine) => !routine.active),
  };
}

export function RoutineList({
  workspaceId,
  initialRoutines,
  serverToday,
}: {
  workspaceId: string;
  initialRoutines: RoutineListItem[];
  /** What the server thought today was — see useToday. */
  serverToday: string;
}) {
  const today = useToday(serverToday);
  const [routines, setRoutines] = useState(initialRoutines);
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editing, setEditing] = useState<RoutineListItem | null>(null);
  const [deleting, setDeleting] = useState<RoutineListItem | null>(null);
  const [isDeletePending, setIsDeletePending] = useState(false);
  const { showError } = useToast();

  const reload = useCallback(async () => {
    const result = await listRoutinesAction(workspaceId, today);
    if (result.success) setRoutines(result.data);
    else showError(result.error.message);
  }, [workspaceId, today, showError]);

  /*
   * The server rendered this against its own day. If the browser is on
   * a different one — the far side of a date line, or simply a tab
   * left open past midnight — everything on screen is answering about
   * the wrong day, so it is asked again about the right one.
   */
  useEffect(() => {
    if (today !== serverToday) void reload();
  }, [today, serverToday, reload]);

  /**
   * Ticking a box moves the tick immediately and asks afterwards.
   *
   * A checkbox that waits for a round trip before it looks checked is
   * a checkbox people tap twice. On failure the row goes back to what
   * it was and the toast says why — the same shape the graph's
   * mutations use.
   *
   * The streak beside it is left alone until the reload answers: it is
   * derived from the whole log, and guessing at it here would be a
   * second implementation of currentStreak that could disagree with
   * the first.
   */
  async function toggle(routine: RoutineListItem, done: boolean) {
    setRoutines((previous) =>
      previous.map((row) =>
        row.id === routine.id ? { ...row, doneToday: done } : row,
      ),
    );

    const result = await setRoutineCompletionAction({
      routineId: routine.id,
      date: today,
      done,
    });

    if (!result.success) {
      setRoutines((previous) =>
        previous.map((row) =>
          row.id === routine.id ? { ...row, doneToday: !done } : row,
        ),
      );
      showError(result.error.message);
      return;
    }

    void reload();
  }

  async function setActive(routine: RoutineListItem, active: boolean) {
    const result = await updateRoutineAction({
      routineId: routine.id,
      active,
    });
    if (!result.success) {
      showError(result.error.message);
      return;
    }
    void reload();
  }

  async function confirmDelete() {
    if (!deleting) return;
    setIsDeletePending(true);
    const result = await deleteRoutineAction(deleting.id);
    setIsDeletePending(false);

    if (!result.success) {
      showError(result.error.message);
      return;
    }
    setDeleting(null);
    void reload();
  }

  const { today: dueToday, otherDays, paused } = group(routines);
  const remaining = dueToday.filter((routine) => !routine.doneToday).length;

  function section(label: string, rows: RoutineListItem[]) {
    if (rows.length === 0) return null;
    return (
      <section className="flex flex-col gap-2">
        <SectionLabel>{label}</SectionLabel>
        <ul className="flex flex-col gap-1.5">
          {rows.map((routine) => (
            <li key={routine.id}>
              <RoutineRow
                routine={routine}
                onToggle={(done) => void toggle(routine, done)}
                onEdit={() => setEditing(routine)}
                onSetActive={(active) => void setActive(routine, active)}
                onDelete={() => setDeleting(routine)}
              />
            </li>
          ))}
        </ul>
      </section>
    );
  }

  return (
    <div className="mx-auto flex w-full max-w-2xl flex-col gap-6 px-3 py-5 sm:px-5">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm text-text-muted">
          {routines.length === 0
            ? "Nothing repeating yet."
            : dueToday.length === 0
              ? "Nothing due today."
              : remaining === 0
                ? "All done for today."
                : `${remaining} of ${dueToday.length} left today.`}
        </p>
        <button
          type="button"
          onClick={() => setIsCreateOpen(true)}
          className="flex shrink-0 items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-sm font-medium text-inverse hover:bg-accent-hover"
        >
          <PlusIcon />
          New routine
        </button>
      </div>

      {routines.length === 0 ? (
        <p className="rounded-lg border border-dashed border-border px-4 py-10 text-center text-sm text-text-faint">
          A routine is something that comes back — it has days rather than a
          finish line. Stories are for the things that end.
        </p>
      ) : (
        <>
          {section("Today", dueToday)}
          {section("Other days", otherDays)}
          {section("Paused", paused)}
        </>
      )}

      {isCreateOpen && (
        <RoutineDialog
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
          onSaved={() => void reload()}
        />
      )}

      {editing && (
        <RoutineDialog
          workspaceId={workspaceId}
          routine={editing}
          onClose={() => setEditing(null)}
          onSaved={() => void reload()}
        />
      )}

      {deleting && (
        <DeleteConfirmDialog
          title={deleting.title}
          note="Its record of the days it was done goes with it. This cannot be undone."
          isPending={isDeletePending}
          onConfirm={() => void confirmDelete()}
          onCancel={() => setDeleting(null)}
        />
      )}
    </div>
  );
}
