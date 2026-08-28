import {
  STORY_FILTER_ORDER,
  isStoryFilter,
  stepStoryFilter,
  storyFilterHref,
} from "@/features/story/filter";

describe("storyFilterHref", () => {
  it("gives All the bare URL — it is the absence of a filter", () => {
    expect(storyFilterHref("ALL")).toBe("/stories");
  });

  it("puts every other filter in the query string", () => {
    expect(storyFilterHref("ACTIVE")).toBe("/stories?status=ACTIVE");
    expect(storyFilterHref("COMPLETED")).toBe("/stories?status=COMPLETED");
    expect(storyFilterHref("ARCHIVED")).toBe("/stories?status=ARCHIVED");
  });
});

describe("stepStoryFilter", () => {
  it("walks forward through the order the chips are shown in", () => {
    expect(stepStoryFilter("ALL", 1)).toBe("ACTIVE");
    expect(stepStoryFilter("ACTIVE", 1)).toBe("COMPLETED");
    expect(stepStoryFilter("COMPLETED", 1)).toBe("ARCHIVED");
  });

  it("walks back", () => {
    expect(stepStoryFilter("ARCHIVED", -1)).toBe("COMPLETED");
    expect(stepStoryFilter("ACTIVE", -1)).toBe("ALL");
  });

  it("stops at both ends rather than wrapping", () => {
    expect(stepStoryFilter("ALL", -1)).toBeNull();
    expect(stepStoryFilter("ARCHIVED", 1)).toBeNull();
  });

  it("returns null for a filter that isn't one", () => {
    // A hand-typed ?status=NONSENSE reaches this as a plain string.
    expect(stepStoryFilter("NONSENSE", 1)).toBeNull();
    expect(stepStoryFilter("", -1)).toBeNull();
  });

  it("can walk the whole row and back without losing a step", () => {
    const forward: string[] = ["ALL"];
    let at: string | null = "ALL";
    while ((at = stepStoryFilter(at, 1))) forward.push(at);
    expect(forward).toEqual(STORY_FILTER_ORDER);
  });
});

describe("isStoryFilter", () => {
  it("accepts the four and nothing else", () => {
    expect(STORY_FILTER_ORDER.every(isStoryFilter)).toBe(true);
    expect(isStoryFilter("NONSENSE")).toBe(false);
    expect(isStoryFilter("active")).toBe(false);
  });
});
