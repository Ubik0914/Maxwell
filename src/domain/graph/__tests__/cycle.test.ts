import { wouldCreateCycle } from "@/domain/graph/cycle";
import type { GraphEdge } from "@/domain/graph/types";

function edge(sourceNodeId: string, targetNodeId: string): GraphEdge {
  return { id: `${sourceNodeId}-${targetNodeId}`, storyId: "story-1", sourceNodeId, targetNodeId };
}

describe("wouldCreateCycle", () => {
  // A -> B -> C
  const edges = [edge("A", "B"), edge("B", "C")];

  it("allows A -> C", () => {
    expect(wouldCreateCycle("A", "C", edges)).toBe(false);
  });

  it("rejects C -> A", () => {
    expect(wouldCreateCycle("C", "A", edges)).toBe(true);
  });

  it("rejects B -> A", () => {
    expect(wouldCreateCycle("B", "A", edges)).toBe(true);
  });

  it("rejects a self-edge A -> A", () => {
    expect(wouldCreateCycle("A", "A", edges)).toBe(true);
  });

  it("allows a connection between two unrelated nodes", () => {
    expect(wouldCreateCycle("D", "E", edges)).toBe(false);
  });
});
