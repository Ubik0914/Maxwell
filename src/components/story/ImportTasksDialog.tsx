"use client";

import { useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { planImport, MAX_IMPORT_ROWS } from "@/domain/graph/import";
import { planImportLayout } from "@/domain/graph/import-layout";
import { importTasksAction } from "@/features/graph/actions";
import type { GraphNode, GraphEdge } from "@/domain/graph/types";

const EXAMPLE = `title,depends_on
Design the schema,
Build the API,Design the schema
Build the UI,Design the schema
Ship it,Build the API;Build the UI`;

/** How many problems to show before saying how many more there are. */
const PROBLEMS_SHOWN = 8;

function Summary({ tasks, edges }: { tasks: number; edges: number }) {
  return (
    <p className="text-sm text-text">
      <span className="font-semibold text-accent">{tasks}</span>{" "}
      {tasks === 1 ? "task" : "tasks"} and{" "}
      <span className="font-semibold text-accent">{edges}</span>{" "}
      {edges === 1 ? "dependency" : "dependencies"} will be added.
    </p>
  );
}

/**
 * Bringing a plan in from somewhere else.
 *
 * Most plans start life in a spreadsheet, and retyping one into a
 * canvas is the kind of work that stops people using the canvas at all.
 * What makes this an import rather than a paste is the dependencies: a
 * list of titles would produce a heap of unconnected tasks, which is
 * not a story. So the file gets a way to say what waits on what, and
 * this shows what that will draw before it draws it.
 *
 * Everything is checked before anything is written, and every problem
 * is shown at once with the line it is on — a spreadsheet with eleven
 * bad rows should take one pass to fix, not eleven attempts. Nothing
 * partial is ever committed: the write is a single transaction, so an
 * import either happened or did not.
 */
export function ImportTasksDialog({
  storyId,
  nodes,
  edges,
  onClose,
}: {
  storyId: string;
  /** The story as it stands — what a row may say it comes after. */
  nodes: GraphNode[];
  edges: GraphEdge[];
  onClose: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [text, setText] = useState("");
  const [fileName, setFileName] = useState<string | null>(null);
  const [isDropping, setIsDropping] = useState(false);
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);
  useEscapeKey(onClose, !isPending, { exclusive: true });

  // Re-planned as you type, which is what makes the problems feel like
  // a description of the file rather than a verdict on pressing Import.
  const plan = useMemo(
    () => (text.trim() === "" ? null : planImport(text, nodes)),
    [text, nodes],
  );

  const canImport =
    plan !== null && plan.problems.length === 0 && plan.rows.length > 0;

  async function readFile(file: File) {
    setFileName(file.name);
    setText(await file.text());
  }

  function handleImport() {
    if (!plan || !canImport) return;

    const positions = planImportLayout(plan.rows, nodes, edges);
    const rows = plan.rows.map((row) => {
      const at = positions.get(row.key);
      return {
        key: row.key,
        title: row.title,
        description: row.description,
        dueDate: row.dueDate,
        priority: row.priority,
        x: at?.x ?? 0,
        y: at?.y ?? 0,
        after: row.after,
        afterIds: row.afterIds,
      };
    });

    startTransition(async () => {
      const result = await importTasksAction({ storyId, rows });
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      onClose();
      router.refresh();
    });
  }

  return (
    <Modal title="Import tasks" onClose={onClose} width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-col gap-1.5 text-xs leading-relaxed text-text-muted">
          <p>
            A CSV with a <code className="text-text">title</code> column. Add{" "}
            <code className="text-text">depends_on</code> to say what a task
            waits on — other rows by title, or tasks already in this story.
            Several go in one cell, separated by{" "}
            <code className="text-text">;</code>.
          </p>
          <p className="text-text-faint">
            Also read: <code>key</code> (when titles repeat),{" "}
            <code>description</code>, <code>due_date</code> (YYYY-MM-DD),{" "}
            <code>priority</code> (1–4). Up to {MAX_IMPORT_ROWS} rows.
          </p>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDropping(true);
          }}
          onDragLeave={() => setIsDropping(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDropping(false);
            const file = event.dataTransfer.files[0];
            if (file) void readFile(file);
          }}
          className={`flex flex-col gap-2 rounded-lg border border-dashed p-2 transition-colors ${
            isDropping ? "border-accent bg-accent-soft" : "border-border"
          }`}
        >
          <textarea
            value={text}
            onChange={(event) => {
              setText(event.target.value);
              setFileName(null);
            }}
            rows={9}
            spellCheck={false}
            placeholder={EXAMPLE}
            aria-label="CSV"
            className="resize-none rounded-md bg-bg px-3 py-2 font-mono text-xs leading-relaxed text-text placeholder:text-text-faint focus:outline-none"
          />
          <div className="flex flex-wrap items-center gap-2 px-1 pb-0.5">
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              className="rounded-md border border-border px-2.5 py-1 text-xs text-text-muted transition-colors hover:border-border-strong hover:text-text"
            >
              Choose a file
            </button>
            <span className="min-w-0 truncate text-xs text-text-faint">
              {fileName ?? "or drop one here, or paste above"}
            </span>
            {text !== "" && (
              <button
                type="button"
                onClick={() => {
                  setText("");
                  setFileName(null);
                }}
                className="ml-auto rounded-md px-2 py-1 text-xs text-text-faint transition-colors hover:text-text"
              >
                Clear
              </button>
            )}
          </div>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv,text/plain"
            hidden
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) void readFile(file);
              // Cleared so choosing the same file twice fires again —
              // which is what somebody does after editing it.
              event.target.value = "";
            }}
          />
        </div>

        {plan && (
          <div className="flex flex-col gap-2">
            {plan.problems.length === 0 ? (
              <Summary tasks={plan.rows.length} edges={plan.edgeCount} />
            ) : (
              <>
                <p className="text-sm text-danger">
                  {plan.problems.length === 1
                    ? "One thing to fix first."
                    : `${plan.problems.length} things to fix first.`}
                </p>
                <ul className="flex max-h-40 flex-col gap-1 overflow-y-auto">
                  {plan.problems.slice(0, PROBLEMS_SHOWN).map((problem, at) => (
                    <li
                      key={`${problem.line}-${at}`}
                      className="flex gap-2 text-xs leading-relaxed"
                    >
                      <span className="shrink-0 tabular-nums text-text-faint">
                        {problem.line === 0 ? "—" : `Line ${problem.line}`}
                      </span>
                      <span className="text-text-muted">{problem.message}</span>
                    </li>
                  ))}
                  {plan.problems.length > PROBLEMS_SHOWN && (
                    <li className="text-xs text-text-faint">
                      and {plan.problems.length - PROBLEMS_SHOWN} more.
                    </li>
                  )}
                </ul>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleImport}
            disabled={!canImport || isPending}
            className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-opacity hover:bg-accent-hover disabled:opacity-40"
          >
            {isPending && <Spinner />}
            Import
          </button>
        </div>
      </div>
    </Modal>
  );
}
