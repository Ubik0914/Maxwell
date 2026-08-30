import { createTaskSchema } from "@/lib/validation/task";

const STORY = "11111111-1111-4111-8111-111111111111";

/**
 * `position` used to be required, which meant the CLI's `task add` —
 * documented, shipped, and unable to know where a canvas would have
 * dropped anything — could not produce a body the API would accept.
 * These pin the shape both callers now rely on.
 */
describe("createTaskSchema", () => {
  it("accepts a task with no position", () => {
    const parsed = createTaskSchema.safeParse({
      storyId: STORY,
      title: "Read the manual",
    });

    expect(parsed.success).toBe(true);
    expect(parsed.success && parsed.data.position).toBeUndefined();
  });

  it("keeps a position when the canvas gives one", () => {
    const parsed = createTaskSchema.safeParse({
      storyId: STORY,
      title: "Read the manual",
      position: { x: 12, y: -4 },
    });

    expect(parsed.success && parsed.data.position).toEqual({ x: 12, y: -4 });
  });

  it("still rejects a position that isn't one", () => {
    // A form reading an absent field as Number(null) is how NaN gets
    // here, and a node at NaN is a node nobody can see.
    const parsed = createTaskSchema.safeParse({
      storyId: STORY,
      title: "Read the manual",
      position: { x: Number.NaN, y: 0 },
    });

    expect(parsed.success).toBe(false);
  });
});
