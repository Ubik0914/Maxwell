import {
  completedMessage,
  unblockedMessage,
} from "@/features/notifications/messages";
import type { GraphNode } from "@/domain/graph/types";

function task(overrides: Partial<GraphNode> & { id: string }): GraphNode {
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

const STORY = { id: "story-1", title: "Ship the reading list" };

describe("unblockedMessage", () => {
  it("says nothing when nothing came free", () => {
    expect(unblockedMessage(STORY, [])).toBeNull();
  });

  it("says nothing about a task that was pushed back to BLOCKED", () => {
    // A cascade demotes as well as promotes, and a task that just
    // became unavailable is not something to interrupt anyone with.
    const affected = [task({ id: "a", status: "BLOCKED" })];
    expect(unblockedMessage(STORY, affected)).toBeNull();
  });

  it("names the task when one came free", () => {
    const affected = [task({ id: "a", title: "Write the intro" })];
    const message = unblockedMessage(STORY, affected)!;

    expect(message.title).toBe("Ship the reading list");
    expect(message.body).toBe("“Write the intro” is ready to start.");
    expect(message.url).toBe("/stories/story-1");
  });

  it("counts the rest when several did", () => {
    const affected = [
      task({ id: "a", title: "Write the intro" }),
      task({ id: "b", title: "Draw the cover" }),
      task({ id: "c", title: "Book the venue" }),
    ];

    expect(unblockedMessage(STORY, affected)!.body).toBe(
      "“Write the intro” and 2 more tasks are ready to start.",
    );
  });

  it("counts one other in the singular", () => {
    const affected = [
      task({ id: "a", title: "Write the intro" }),
      task({ id: "b", title: "Draw the cover" }),
    ];

    expect(unblockedMessage(STORY, affected)!.body).toBe(
      "“Write the intro” and 1 more task is ready to start.",
    );
  });

  it("cuts a title too long to fit on a lock screen", () => {
    const long = "A".repeat(120);
    const body = unblockedMessage(STORY, [task({ id: "a", title: long })])!.body;

    expect(body.length).toBeLessThan(long.length);
    expect(body).toContain("…");
  });

  it("collapses a run of these into one notification per story", () => {
    // An agent working through a graph unblocks something on every
    // call. Five swipes for one session's work is a reason to turn
    // notifications off.
    const first = unblockedMessage(STORY, [task({ id: "a" })])!;
    const second = unblockedMessage(STORY, [task({ id: "b" })])!;

    expect(first.tag).toBe(second.tag);
  });
});

describe("completedMessage", () => {
  it("is about the story, and points at it", () => {
    const message = completedMessage(STORY);

    expect(message.title).toBe("Ship the reading list");
    expect(message.body).toContain("complete");
    expect(message.url).toBe("/stories/story-1");
  });
});
