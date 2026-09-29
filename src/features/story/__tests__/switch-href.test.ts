import { storySwitchHref } from "@/features/story/switch-href";

describe("storySwitchHref", () => {
  it("keeps the view you are already in", () => {
    expect(storySwitchHref("b", "/maxwell/stories/a/list")).toBe(
      "/maxwell/stories/b/list",
    );
    expect(storySwitchHref("b", "/maxwell/stories/a/board")).toBe(
      "/maxwell/stories/b/board",
    );
  });

  it("goes to the graph from the graph", () => {
    expect(storySwitchHref("b", "/maxwell/stories/a")).toBe(
      "/maxwell/stories/b",
    );
  });

  it("goes to the graph from anywhere that isn't a story view", () => {
    for (const from of [
      "/maxwell/stories",
      "/maxwell/workspaces",
      "/maxwell/settings/members",
      "/",
    ]) {
      expect(storySwitchHref("b", from)).toBe("/maxwell/stories/b");
    }
  });

  it("does not carry a segment that isn't a view", () => {
    // A path this app doesn't serve must not be built out of a menu press.
    expect(storySwitchHref("b", "/maxwell/stories/a/settings")).toBe(
      "/maxwell/stories/b",
    );
    expect(storySwitchHref("b", "/maxwell/stories/a/list/extra")).toBe(
      "/maxwell/stories/b",
    );
  });

  it("takes the workspace-wide view the same way, keeping the view", () => {
    expect(storySwitchHref("all", "/maxwell/stories/a/board")).toBe(
      "/maxwell/stories/all/board",
    );
    expect(storySwitchHref("all", "/maxwell/stories/a")).toBe(
      "/maxwell/stories/all",
    );
    // And back out of it into a story, still in the same view.
    expect(storySwitchHref("b", "/maxwell/stories/all/list")).toBe(
      "/maxwell/stories/b/list",
    );
  });

  it("is stable on the story you are already looking at", () => {
    expect(storySwitchHref("a", "/maxwell/stories/a/board")).toBe(
      "/maxwell/stories/a/board",
    );
  });
});
