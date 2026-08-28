import { storySwitchHref } from "@/features/story/switch-href";

describe("storySwitchHref", () => {
  it("keeps the view you are already in", () => {
    expect(storySwitchHref("b", "/stories/a/list")).toBe("/stories/b/list");
    expect(storySwitchHref("b", "/stories/a/board")).toBe("/stories/b/board");
  });

  it("goes to the graph from the graph", () => {
    expect(storySwitchHref("b", "/stories/a")).toBe("/stories/b");
  });

  it("goes to the graph from anywhere that isn't a story view", () => {
    for (const from of ["/stories", "/workspaces", "/settings/members", "/"]) {
      expect(storySwitchHref("b", from)).toBe("/stories/b");
    }
  });

  it("does not carry a segment that isn't a view", () => {
    // A path this app doesn't serve must not be built out of a menu press.
    expect(storySwitchHref("b", "/stories/a/settings")).toBe("/stories/b");
    expect(storySwitchHref("b", "/stories/a/list/extra")).toBe("/stories/b");
  });

  it("is stable on the story you are already looking at", () => {
    expect(storySwitchHref("a", "/stories/a/board")).toBe("/stories/a/board");
  });
});
