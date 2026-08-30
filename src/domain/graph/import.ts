import type { GraphNode } from "@/domain/graph/types";
import { parseCsv } from "@/domain/csv/parse";

/**
 * How many tasks one paste may ask for. Not a technical limit — it is
 * the point past which somebody has pasted the wrong file, and finding
 * that out from a spinner is worse than finding it out from a sentence.
 */
export const MAX_IMPORT_ROWS = 500;

const MAX_TITLE = 200;
const MAX_DESCRIPTION = 5000;

export interface ImportRow {
  /** Unique within the file. Defaults to the title. */
  key: string;
  title: string;
  description: string | null;
  dueDate: string | null;
  priority: number | null;
  /** Keys of other imported rows this waits on. */
  after: string[];
  /** Ids of nodes already in the story this waits on. */
  afterIds: string[];
  line: number;
}

export interface ImportProblem {
  /** 1-based line in the file, or 0 for something wrong with the file. */
  line: number;
  message: string;
}

export interface ImportPlan {
  rows: ImportRow[];
  problems: ImportProblem[];
  /** Dependencies that will be drawn, START and GOAL included. */
  edgeCount: number;
}

/**
 * The header names understood, and what they mean. Matched loosely —
 * case, spaces, hyphens and underscores are all the same thing —
 * because the file came out of a spreadsheet somebody else set up.
 */
const COLUMNS: Record<string, string[]> = {
  key: ["key", "id", "ref"],
  title: ["title", "task", "name", "summary"],
  description: ["description", "notes", "detail", "details", "body"],
  after: ["dependson", "depends", "after", "blockedby", "requires", "parents"],
  dueDate: ["duedate", "due", "deadline"],
  priority: ["priority", "prio"],
};

const normalise = (name: string) =>
  name.trim().toLowerCase().replace(/[\s_-]/g, "");

/** Several dependencies in one cell. Not a comma — this is a CSV. */
const SEPARATORS = /[;|\n]/;

/**
 * Reads a CSV into the tasks and dependencies it describes, or into the
 * reasons it cannot be read.
 *
 * A list of titles is not a graph. Maxwell's whole subject is what has
 * to happen before what, so the file gets a way to say it: a `key` per
 * row, and a `depends_on` naming other keys. Where the titles are
 * already unique the key can be left out and `depends_on` can name
 * titles directly, which is what somebody writing this by hand will do
 * anyway.
 *
 * A reference resolves against the file first and the story second, so
 * a row can also be hung off a task that is already there — "these five
 * come after Design the schema" — without knowing any ids. A name that
 * two existing tasks share resolves to neither, and says so, because
 * guessing which one was meant is exactly the kind of help that quietly
 * builds the wrong graph.
 *
 * Everything is checked before anything is written, and the problems
 * come back together rather than one per attempt: a spreadsheet with
 * eleven bad rows should take one pass to fix, not eleven.
 */
export function planImport(text: string, existing: GraphNode[]): ImportPlan {
  const problems: ImportProblem[] = [];
  const table = parseCsv(text);

  if (table.length === 0) {
    return { rows: [], problems: [{ line: 0, message: "That file is empty." }], edgeCount: 0 };
  }

  const [header, ...body] = table;
  const columnAt: Record<string, number> = {};
  header.cells.forEach((name, index) => {
    const found = Object.entries(COLUMNS).find(([, aliases]) =>
      aliases.includes(normalise(name)),
    );
    if (found && columnAt[found[0]] === undefined) columnAt[found[0]] = index;
  });

  if (columnAt.title === undefined) {
    return {
      rows: [],
      problems: [
        {
          line: header.line,
          message:
            "No title column. The first line has to name the columns — at least one of them called title.",
        },
      ],
      edgeCount: 0,
    };
  }

  if (body.length > MAX_IMPORT_ROWS) {
    return {
      rows: [],
      problems: [
        {
          line: 0,
          message: `${body.length} rows is more than one import can take (${MAX_IMPORT_ROWS}).`,
        },
      ],
      edgeCount: 0,
    };
  }

  // Existing tasks by title, so a row can depend on one. START and GOAL
  // are left out: nothing may point into START, and depending on GOAL
  // would put work after the end of the story.
  const existingByTitle = new Map<string, string[]>();
  for (const node of existing) {
    if (node.type !== "TASK") continue;
    const title = node.title.trim();
    existingByTitle.set(title, [...(existingByTitle.get(title) ?? []), node.id]);
  }

  const cell = (row: string[], column: string) =>
    (columnAt[column] !== undefined ? (row[columnAt[column]] ?? "") : "").trim();

  // First pass: the rows themselves, and their keys, which the second
  // pass needs all of before it can resolve anything.
  const rows: ImportRow[] = [];
  const keyed = new Map<string, ImportRow>();

  for (const { line, cells } of body) {
    const title = cell(cells, "title");
    if (title === "" && cells.every((value) => value.trim() === "")) continue;

    if (title === "") {
      problems.push({ line, message: "No title." });
      continue;
    }
    if (title.length > MAX_TITLE) {
      problems.push({
        line, message: `Title is ${title.length} characters; ${MAX_TITLE} is the most.`,
      });
      continue;
    }

    const description = cell(cells, "description");
    if (description.length > MAX_DESCRIPTION) {
      problems.push({
        line,
        message: `Description is ${description.length} characters; ${MAX_DESCRIPTION} is the most.`,
      });
      continue;
    }

    const key = cell(cells, "key") || title;
    if (keyed.has(key)) {
      problems.push({
        line,
        message: `"${key}" is already used on line ${keyed.get(key)!.line}. Keys have to be unique — give one of them a key column of its own.`,
      });
      continue;
    }

    const row: ImportRow = {
      key,
      title,
      description: description || null,
      dueDate: readDueDate(cell(cells, "dueDate"), line, problems),
      priority: readPriority(cell(cells, "priority"), line, problems),
      // Deduplicated, because a dependency named twice is one
      // dependency — and because edges are unique on (source, target),
      // so the second one would fail the insert and roll the whole
      // import back over a repetition that meant nothing.
      after: [
        ...new Set(
          cell(cells, "after")
            .split(SEPARATORS)
            .map((name) => name.trim())
            .filter((name) => name !== ""),
        ),
      ],
      afterIds: [],
      line,
    };

    rows.push(row);
    keyed.set(key, row);
  }

  // Second pass: what each row waits on. The file wins over the story,
  // so a file that names its own rows is self-contained however the
  // story happens to be titled.
  for (const row of rows) {
    const after: string[] = [];
    for (const name of row.after) {
      if (keyed.has(name)) {
        if (name === row.key) {
          problems.push({ line: row.line, message: "A task cannot wait on itself." });
          continue;
        }
        after.push(name);
        continue;
      }

      const matches = existingByTitle.get(name) ?? [];
      if (matches.length === 1) {
        row.afterIds.push(matches[0]);
        continue;
      }
      problems.push({
        line: row.line,
        message:
          matches.length > 1
            ? `"${name}" is the title of ${matches.length} tasks already in this story, so it is not clear which one is meant.`
            : `Nothing called "${name}" — not in this file, and not in this story.`,
      });
    }
    row.after = after;
  }

  for (const ring of cycles(rows)) {
    problems.push({
      line: ring[0].line,
      message: `These wait on each other and so none of them could ever start: ${ring
        .map((row) => `"${row.key}"`)
        .join(" → ")} → "${ring[0].key}".`,
    });
  }

  // In file order, not in the order they were found. They are found in
  // three passes — the rows, then what they refer to, then the rings —
  // so a straight append lists line 6 above line 5 above line 2, and
  // somebody reading down their spreadsheet has to jump about.
  problems.sort((a, b) => a.line - b.line);

  return { rows, problems, edgeCount: countEdges(rows) };
}

function readDueDate(
  value: string,
  line: number,
  problems: ImportProblem[],
): string | null {
  if (value === "") return null;
  // Checked rather than parsed loosely: "03/04/2026" is two different
  // days depending on who wrote it, and an importer that picks one is
  // an importer that is wrong half the time in the other half of the
  // world.
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value) || Number.isNaN(Date.parse(value))) {
    problems.push({
      line,
      message: `"${value}" is not a date this can read. Use YYYY-MM-DD.`,
    });
    return null;
  }
  return value;
}

function readPriority(
  value: string,
  line: number,
  problems: ImportProblem[],
): number | null {
  if (value === "") return null;
  const priority = Number(value);
  if (!Number.isInteger(priority) || priority < 1 || priority > 4) {
    problems.push({
      line,
      message: `Priority is 1 to 4, where 1 is highest. "${value}" is not one of them.`,
    });
    return null;
  }
  return priority;
}

/**
 * Every ring of rows that wait on each other, one per ring.
 *
 * Only the file can contain one. A row may depend on a task already in
 * the story, never the other way round, and the two edges this draws by
 * itself cannot close a ring either — nothing points into START, and
 * nothing leads out of GOAL.
 *
 * Reported as the ring rather than as "there is a cycle": the fix is to
 * cut one of the named links, and a person cannot cut what they have
 * not been shown.
 */
function cycles(rows: ImportRow[]): ImportRow[][] {
  const byKey = new Map(rows.map((row) => [row.key, row]));
  const state = new Map<string, "open" | "closed">();
  const found: ImportRow[][] = [];
  const path: ImportRow[] = [];

  const walk = (row: ImportRow) => {
    state.set(row.key, "open");
    path.push(row);

    for (const key of row.after) {
      const next = byKey.get(key);
      if (!next) continue;
      const seen = state.get(key);
      if (seen === "open") {
        found.push(path.slice(path.findIndex((step) => step.key === key)));
      } else if (seen === undefined) {
        walk(next);
      }
    }

    path.pop();
    state.set(row.key, "closed");
  };

  for (const row of rows) {
    if (!state.has(row.key)) walk(row);
  }

  return found;
}

/**
 * How many dependency lines this will draw: the ones the file names,
 * plus the ones that make it a story rather than a heap — a row that
 * waits on nothing hangs off START, and a row nothing waits on leads to
 * GOAL.
 */
function countEdges(rows: ImportRow[]): number {
  const dependedOn = new Set(rows.flatMap((row) => row.after));
  let count = 0;
  for (const row of rows) {
    count += row.after.length + row.afterIds.length;
    if (row.after.length === 0 && row.afterIds.length === 0) count += 1;
    if (!dependedOn.has(row.key)) count += 1;
  }
  return count;
}
