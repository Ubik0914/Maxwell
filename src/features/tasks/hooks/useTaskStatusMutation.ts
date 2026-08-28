"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { updateTaskStatusAction } from "@/features/graph/actions";
import type { SettableStatus } from "@/components/task/status";

/** Long enough for the flash to finish, short enough not to linger. */
const SETTLE_MS = 800;

const FLASH_TONE: Record<SettableStatus, string> = {
  READY: "flash-ready",
  IN_PROGRESS: "flash-progress",
  DONE: "flash-done",
  CANCELLED: "flash-cancelled",
};

export interface TaskStatusMutation {
  changeStatus: (taskId: string, status: SettableStatus) => void;
  /** The class pair to hang on whatever just changed, or "". */
  flashClass: (taskId: string, base: "state-changed" | "row-changed") => string;
  isPending: boolean;
}

/**
 * Changing a task's state from a list or a board.
 *
 * Everything real happens on the server — the Status Engine may reject
 * the move (BLOCKED -> IN_PROGRESS) and may cascade the change through
 * downstream tasks — so this doesn't guess: it calls the action, reports
 * a refusal, and refreshes. What it adds is the moment *after*: the row
 * or card that changed is marked briefly so a re-sort has something
 * connecting where the task was to where it went.
 *
 * The marker expires on a timer rather than by anyone clearing it, so
 * nothing has to remember to put the view back.
 */
export function useTaskStatusMutation(): TaskStatusMutation {
  const router = useRouter();
  const { showError } = useToast();
  const [changed, setChanged] = useState<{
    id: string;
    status: SettableStatus;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // A pending flash on an unmounting view has nothing left to flash.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const changeStatus = useCallback(
    (taskId: string, status: SettableStatus) => {
      startTransition(async () => {
        const result = await updateTaskStatusAction({ taskId, status });
        if (!result.success) {
          showError(result.error.message);
          return;
        }

        if (timer.current) clearTimeout(timer.current);
        setChanged({ id: taskId, status });
        timer.current = setTimeout(() => setChanged(null), SETTLE_MS);

        router.refresh();
      });
    },
    [router, showError],
  );

  const flashClass = useCallback(
    (taskId: string, base: "state-changed" | "row-changed") =>
      changed?.id === taskId ? `${base} ${FLASH_TONE[changed.status]}` : "",
    [changed],
  );

  return { changeStatus, flashClass, isPending };
}
