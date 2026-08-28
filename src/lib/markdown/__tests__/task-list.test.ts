import { toggleTaskAt } from "@/lib/markdown/task-list";

describe("toggleTaskAt", () => {
  const list = ["- [ ] one", "- [x] two", "- [ ] three"].join("\n");

  it("ticks an unticked box", () => {
    expect(toggleTaskAt(list, 0)).toBe(
      ["- [x] one", "- [x] two", "- [ ] three"].join("\n"),
    );
  });

  it("unticks a ticked one", () => {
    expect(toggleTaskAt(list, 1)).toBe(
      ["- [ ] one", "- [ ] two", "- [ ] three"].join("\n"),
    );
  });

  it("touches only the one asked for", () => {
    expect(toggleTaskAt(list, 2)).toBe(
      ["- [ ] one", "- [x] two", "- [x] three"].join("\n"),
    );
  });

  it("tells apart two items that say the same thing", () => {
    const same = ["- [ ] 同じ", "- [ ] 同じ"].join("\n");
    expect(toggleTaskAt(same, 1)).toBe(["- [ ] 同じ", "- [x] 同じ"].join("\n"));
  });

  it("counts nested items in document order", () => {
    const nested = [
      "- [ ] outer",
      "  - [ ] inner",
      "- [ ] after",
    ].join("\n");
    expect(toggleTaskAt(nested, 1)).toBe(
      ["- [ ] outer", "  - [x] inner", "- [ ] after"].join("\n"),
    );
  });

  it("handles the other bullet characters and ordered lists", () => {
    expect(toggleTaskAt("* [ ] star", 0)).toBe("* [x] star");
    expect(toggleTaskAt("+ [ ] plus", 0)).toBe("+ [x] plus");
    expect(toggleTaskAt("1. [ ] one", 0)).toBe("1. [x] one");
  });

  it("accepts an upper-case X as ticked", () => {
    expect(toggleTaskAt("- [X] shouty", 0)).toBe("- [ ] shouty");
  });

  it("leaves a bracket that isn't a checkbox alone", () => {
    const prose = "See [the docs](https://example.com) and - [ ] mid-line";
    expect(toggleTaskAt(prose, 0)).toBe(prose);
  });

  it("returns the source unchanged for an index that isn't there", () => {
    expect(toggleTaskAt(list, 9)).toBe(list);
    expect(toggleTaskAt(list, -1)).toBe(list);
  });

  it("is safe on text with no checkboxes at all", () => {
    expect(toggleTaskAt("# Just a heading", 0)).toBe("# Just a heading");
    expect(toggleTaskAt("", 0)).toBe("");
  });

  it("does not carry state between calls", () => {
    // The pattern is global; sharing one RegExp object across calls
    // would leave lastIndex behind and skip matches on the next.
    expect(toggleTaskAt(list, 0)).toBe(toggleTaskAt(list, 0));
    expect(toggleTaskAt(list, 2)).toBe(toggleTaskAt(list, 2));
  });
});
