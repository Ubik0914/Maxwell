import { planImport, MAX_IMPORT_ROWS } from "@/domain/graph/import";
import type { GraphNode } from "@/domain/graph/types";

function node(overrides: Partial<GraphNode> & { id: string }): GraphNode {
  return {
    storyId: "story-1",
    type: "TASK",
    title: overrides.id,
    description: null,
    status: "READY",
    assigneeId: null,
    priority: null,
    dueDate: null,
    positionX: 0,
    positionY: 0,
    sortOrder: null,
    ...overrides,
  };
}

const STORY = [
  node({ id: "start", type: "START", title: "Today", status: null }),
  node({ id: "goal", type: "GOAL", title: "Shipped", status: null }),
  node({ id: "schema", title: "Design the schema", status: "DONE" }),
];

const messages = (text: string, existing = STORY) =>
  planImport(text, existing).problems.map((problem) => problem.message);

describe("planImport", () => {
  it("reads titles and the dependencies between them", () => {
    const plan = planImport(
      [
        "title,depends_on",
        "Build the API,",
        "Build the UI,",
        "Ship it,Build the API;Build the UI",
      ].join("\n"),
      STORY,
    );

    expect(plan.problems).toEqual([]);
    expect(plan.rows.map((row) => row.key)).toEqual([
      "Build the API",
      "Build the UI",
      "Ship it",
    ]);
    expect(plan.rows[2].after).toEqual(["Build the API", "Build the UI"]);
  });

  it("counts the lines it will draw, START and GOAL included", () => {
    const plan = planImport(
      ["title,depends_on", "A,", "B,A"].join("\n"),
      STORY,
    );

    // START→A, A→B, B→GOAL. A is not an ending; B is.
    expect(plan.edgeCount).toBe(3);
  });

  it("lets a row wait on a task already in the story", () => {
    const plan = planImport(
      ["title,depends_on", "Build the API,Design the schema"].join("\n"),
      STORY,
    );

    expect(plan.problems).toEqual([]);
    expect(plan.rows[0].afterIds).toEqual(["schema"]);
    expect(plan.rows[0].after).toEqual([]);
  });

  it("prefers a key in the file over a task in the story with the same title", () => {
    // The file is the local scope. A file that names its own rows means
    // the same thing whatever the story happens to be called.
    const plan = planImport(
      ["title,depends_on", "Design the schema,", "Build the API,Design the schema"].join("\n"),
      STORY,
    );

    expect(plan.rows[1].after).toEqual(["Design the schema"]);
    expect(plan.rows[1].afterIds).toEqual([]);
  });

  it("refuses to guess between two existing tasks with the same title", () => {
    const twice = [...STORY, node({ id: "schema-2", title: "Design the schema" })];
    expect(messages("title,depends_on\nA,Design the schema", twice)).toEqual([
      expect.stringContaining("not clear which one is meant"),
    ]);
  });

  it("names a dependency that does not exist anywhere", () => {
    expect(messages("title,depends_on\nA,Nowhere")).toEqual([
      'Nothing called "Nowhere" — not in this file, and not in this story.',
    ]);
  });

  it("will not let a task wait on itself", () => {
    expect(messages("title,depends_on\nA,A")).toEqual([
      "A task cannot wait on itself.",
    ]);
  });

  it("reports a ring by naming it, not just that one exists", () => {
    // The fix is to cut one of these links, and nobody can cut what
    // they have not been shown.
    const [message] = messages(
      ["title,depends_on", "A,C", "B,A", "C,B"].join("\n"),
    );
    expect(message).toContain('"A"');
    expect(message).toContain('"B"');
    expect(message).toContain('"C"');
  });

  it("accepts a diamond, which is not a ring", () => {
    expect(
      messages(["title,depends_on", "A,", "B,A", "C,A", "D,B;C"].join("\n")),
    ).toEqual([]);
  });

  it("collects every problem in one pass", () => {
    // Eleven bad rows should take one pass to fix, not eleven attempts.
    const plan = planImport(
      ["title,depends_on", ",Nowhere", "A,Nowhere", "B,Elsewhere"].join("\n"),
      STORY,
    );
    expect(plan.problems).toHaveLength(3);
    expect(plan.problems.map((problem) => problem.line)).toEqual([2, 3, 4]);
  });

  it("lists the problems in file order, not in the order it found them", () => {
    // Found in three passes — rows, then references, then rings — so
    // without sorting these come back 5, 4, 2 and the person reading
    // down their spreadsheet has to jump about.
    const plan = planImport(
      ["title,depends_on", "A,B", "B,A", "C,Nowhere", ",Orphan"].join("\n"),
      STORY,
    );
    expect(plan.problems.map((problem) => problem.line)).toEqual([2, 4, 5]);
  });

  it("points at the line in the file, counting the header", () => {
    expect(planImport("title\n\nA\n", STORY).rows[0].line).toBe(3);
  });

  it("takes a key column when titles repeat", () => {
    const plan = planImport(
      ["key,title,depends_on", "one,Review,", "two,Review,one"].join("\n"),
      STORY,
    );
    expect(plan.problems).toEqual([]);
    expect(plan.rows.map((row) => row.title)).toEqual(["Review", "Review"]);
    expect(plan.rows[1].after).toEqual(["one"]);
  });

  it("refuses two rows with the same key, naming the other line", () => {
    expect(messages("title\nReview\nReview")).toEqual([
      expect.stringContaining("line 2"),
    ]);
  });

  it.each([
    ["Depends On", "Depends On"],
    ["DEPENDS_ON", "DEPENDS_ON"],
    ["blocked-by", "blocked-by"],
    ["after", "after"],
    ["requires", "requires"],
  ])("understands %s as the dependency column", (_name, header) => {
    const plan = planImport(`title,${header}\nA,\nB,A`, STORY);
    expect(plan.rows[1].after).toEqual(["A"]);
  });

  it("needs a header naming a title column", () => {
    expect(messages("Build the API\nBuild the UI")).toEqual([
      expect.stringContaining("No title column"),
    ]);
  });

  it("reads dates only in an unambiguous form", () => {
    // 03/04/2026 is two different days depending on who wrote it.
    expect(messages("title,due_date\nA,03/04/2026")).toEqual([
      expect.stringContaining("YYYY-MM-DD"),
    ]);
    expect(planImport("title,due\nA,2026-09-02", STORY).rows[0].dueDate).toBe(
      "2026-09-02",
    );
  });

  it("takes priority 1 to 4 and nothing else", () => {
    expect(planImport("title,priority\nA,1", STORY).rows[0].priority).toBe(1);
    expect(messages("title,priority\nA,9")).toEqual([
      expect.stringContaining("1 to 4"),
    ]);
  });

  it("refuses a title longer than the column can hold", () => {
    expect(messages(`title\n${"x".repeat(201)}`)).toEqual([
      expect.stringContaining("200 is the most"),
    ]);
  });

  it("skips a wholly blank row rather than calling it a problem", () => {
    const plan = planImport("title,depends_on\nA,\n,\n", STORY);
    expect(plan.problems).toEqual([]);
    expect(plan.rows).toHaveLength(1);
  });

  it("refuses a file bigger than one import, before reading it", () => {
    const rows = Array.from({ length: MAX_IMPORT_ROWS + 1 }, (_, i) => `T${i}`);
    expect(messages(["title", ...rows].join("\n"))).toEqual([
      expect.stringContaining(`${MAX_IMPORT_ROWS}`),
    ]);
  });

  it("says so about an empty file", () => {
    expect(messages("")).toEqual(["That file is empty."]);
  });
});

describe("planImport, on repetition", () => {
  it("counts a dependency named twice as one", () => {
    // Edges are unique on (source, target), so a second identical one
    // would fail the insert and roll the whole import back — over a
    // repetition that meant nothing.
    const plan = planImport(
      ["title,depends_on", "A,", "B,A;A"].join("\n"),
      STORY,
    );

    expect(plan.problems).toEqual([]);
    expect(plan.rows[1].after).toEqual(["A"]);
    expect(plan.edgeCount).toBe(3);
  });

  it("counts an existing task named twice as one", () => {
    const plan = planImport(
      "title,depends_on\nA,Design the schema;Design the schema",
      STORY,
    );
    expect(plan.rows[0].afterIds).toEqual(["schema"]);
  });
});
