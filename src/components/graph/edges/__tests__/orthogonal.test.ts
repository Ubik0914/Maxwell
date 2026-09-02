import {
  longestRunMidpoint,
  orthogonalPath,
} from "@/components/graph/edges/orthogonal";

describe("orthogonalPath", () => {
  it("starts where it is told and ends where it is told", () => {
    const d = orthogonalPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
    ]);

    expect(d.startsWith("M 0,0")).toBe(true);
    expect(d.endsWith("L 100,200")).toBe(true);
  });

  it("rounds each corner with a curve through it", () => {
    const d = orthogonalPath([
      { x: 0, y: 0 },
      { x: 100, y: 0 },
      { x: 100, y: 200 },
      { x: 300, y: 200 },
    ]);

    // Two corners, so two curves.
    expect(d.match(/Q /g)).toHaveLength(2);
    expect(d).toContain("Q 100,0");
    expect(d).toContain("Q 100,200");
  });

  it("never rounds away more than half a run", () => {
    // A 10px step: a 12px corner radius on both sides would turn the
    // segment inside out.
    const d = orthogonalPath([
      { x: 0, y: 0 },
      { x: 10, y: 0 },
      { x: 10, y: 10 },
      { x: 20, y: 10 },
    ]);

    const xs = [...d.matchAll(/(-?\d+(?:\.\d+)?),(-?\d+(?:\.\d+)?)/g)].map(
      (match) => Number(match[1]),
    );
    for (let at = 1; at < xs.length; at += 1) {
      expect(xs[at]).toBeGreaterThanOrEqual(xs[at - 1]);
    }
  });

  it("has nothing to draw for no points", () => {
    expect(orthogonalPath([])).toBe("");
    expect(orthogonalPath([{ x: 5, y: 5 }])).toBe("M 5,5");
  });
});

describe("longestRunMidpoint", () => {
  it("sits in the middle of the longest straight run", () => {
    const middle = longestRunMidpoint([
      { x: 0, y: 0 },
      { x: 40, y: 0 },
      { x: 40, y: -300 },
      { x: 840, y: -300 },
      { x: 840, y: 0 },
    ]);

    // The lane, not the climb up to it.
    expect(middle).toEqual({ x: 440, y: -300 });
  });

  it("answers for a path with nothing in it", () => {
    expect(longestRunMidpoint([])).toEqual({ x: 0, y: 0 });
  });
});
