import { STORY_FILTER_ORDER } from "@/features/story/filter";

describe("STORY_FILTER_ORDER", () => {
  it("leads with the absence of a filter", () => {
    expect(STORY_FILTER_ORDER[0]).toBe("ALL");
  });

  it("names every story status once, and nothing else", () => {
    expect(STORY_FILTER_ORDER).toEqual([
      "ALL",
      "ACTIVE",
      "COMPLETED",
      "ARCHIVED",
    ]);
    expect(new Set(STORY_FILTER_ORDER).size).toBe(STORY_FILTER_ORDER.length);
  });
});
