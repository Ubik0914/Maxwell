import { safeNextPath } from "../safe-next";

describe("safeNextPath", () => {
  it("keeps a path on this site", () => {
    expect(safeNextPath("/")).toBe("/");
    expect(safeNextPath("/maxwell/stories/abc")).toBe("/maxwell/stories/abc");
    expect(safeNextPath("/?q=orwell")).toBe("/?q=orwell");
  });

  it("refuses anything that leaves it", () => {
    expect(safeNextPath("https://evil.example")).toBeNull();
    expect(safeNextPath("//evil.example")).toBeNull();
    expect(safeNextPath("/\\evil.example")).toBeNull();
    expect(safeNextPath("maxwell")).toBeNull();
  });

  it("refuses what is not a string", () => {
    expect(safeNextPath(null)).toBeNull();
    expect(safeNextPath(undefined)).toBeNull();
  });
});
