import { FILTER_ORDER, stepFilter } from "@/features/tasks/filter";

describe("stepFilter", () => {
  it("starts at All and walks forward through the states", () => {
    expect(stepFilter(null, 1)).toBe("READY");
    expect(stepFilter("READY", 1)).toBe("IN_PROGRESS");
    expect(stepFilter("IN_PROGRESS", 1)).toBe("DONE");
    expect(stepFilter("DONE", 1)).toBe("CANCELLED");
    expect(stepFilter("CANCELLED", 1)).toBe("BLOCKED");
  });

  it("walks back", () => {
    expect(stepFilter("BLOCKED", -1)).toBe("CANCELLED");
    expect(stepFilter("READY", -1)).toBeNull();
  });

  it("stops at both ends rather than wrapping", () => {
    expect(stepFilter(null, -1)).toBeUndefined();
    expect(stepFilter("BLOCKED", 1)).toBeUndefined();
  });

  it("can walk the whole row without losing a step", () => {
    const walked: (string | null)[] = [null];
    let at = stepFilter(null, 1);
    while (at !== undefined) {
      walked.push(at);
      at = stepFilter(at, 1);
    }
    expect(walked).toEqual(FILTER_ORDER);
  });

  it("puts Blocked last, where the chips do", () => {
    expect(FILTER_ORDER[FILTER_ORDER.length - 1]).toBe("BLOCKED");
  });
});
