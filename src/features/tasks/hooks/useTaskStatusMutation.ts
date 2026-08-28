"use client";

import {
  useCallback,
  useEffect,
  useOptimistic,
  useRef,
  useState,
  useTransition,
} from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/Toast";
import { updateTaskStatusAction } from "@/features/graph/actions";
import type { GraphNode } from "@/domain/graph/types";
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
  /** The graph as it should be drawn right now, pending writes included. */
  nodes: GraphNode[];
  changeStatus: (taskId: string, status: SettableStatus) => void;
  /** The class pair to hang on whatever just changed, or "". */
  flashClass: (taskId: string, base: "state-changed" | "row-changed") => string;
  isPending: boolean;
}

/**
 * Changing a task's state from a list or a board.
 *
 * The view moves first. A list sorted by state re-sorts on every change,
 * so waiting for the server means pressing Done and watching nothing
 * happen for a round-trip — the one moment the interface most needs to
 * look like it heard you. The chosen status is applied to the nodes
 * this hook hands back, and everything derived from them (the order,
 * the counts, which board column the card is in) follows immediately.
 *
 * It is optimism, not a local source of truth. The Status Engine may
 * refuse the move (BLOCKED -> IN_PROGRESS) and may cascade the change
 * through downstream tasks, neither of which is guessed at here. React
 * drops the optimistic value when the transition ends, so a refusal
 * snaps back on its own and a success is replaced by the server's own
 * answer — which carries the cascade too.
 *
 * On top of that, the row or card that changed is marked briefly, so a
 * re-sort has something connecting where the task was to where it went.
 * The marker expires on a timer rather than by anyone clearing it.
 */
export function useTaskStatusMutation(
  serverNodes: GraphNode[],
): TaskStatusMutation {
  const router = useRouter();
  const { showError } = useToast();
  const [changed, setChanged] = useState<{
    id: string;
    status: SettableStatus;
  } | null>(null);
  const [isPending, startTransition] = useTransition();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [nodes, applyStatus] = useOptimistic(
    serverNodes,
    (current, patch: { id: string; status: SettableStatus }) =>
      current.map((node) =>
        node.id === patch.id ? { ...node, status: patch.status } : node,
      ),
  );

  // A pending flash on an unmounting view has nothing left to flash.
  useEffect(() => {
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, []);

  const changeStatus = useCallback(
    (taskId: string, status: SettableStatus) => {
      startTransition(async () => {
        applyStatus({ id: taskId, status });

        // Marked before the write, for the same reason the status is:
        // the flash is feedback on the press, not a report on the
        // server. A refusal replaces it with a toast.
        if (timer.current) clearTimeout(timer.current);
        setChanged({ id: taskId, status });
        timer.current = setTimeout(() => setChanged(null), SETTLE_MS);

        const result = await updateTaskStatusAction({ taskId, status });
        if (!result.success) {
          showError(result.error.message);
          return;
        }

        router.refresh();
      });
    },
    [applyStatus, router, showError],
  );

  const flashClass = useCallback(
    (taskId: string, base: "state-changed" | "row-changed") =>
      changed?.id === taskId ? `${base} ${FLASH_TONE[changed.status]}` : "",
    [changed],
  );

  return { nodes, changeStatus, flashClass, isPending };
}
