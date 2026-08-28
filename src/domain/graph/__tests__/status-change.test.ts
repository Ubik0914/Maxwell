import {
  canRequestStatus,
  validateStatusChange,
} from "@/domain/graph/status-change";
import { SETTABLE_STATUSES } from "@/domain/graph/types";

describe("validateStatusChange", () => {
  it("allows anything once the dependencies are satisfied", () => {
    for (const target of SETTABLE_STATUSES) {
      expect(validateStatusChange(target, "READY")).toEqual({ allowed: true });
    }
  });

  it("refuses Ready while the task is still waiting", () => {
    // The part that used to be missing. Ready is a fact about the graph,
    // not a wish: asserting it by hand would put a task on the frontier
    // that nobody can actually start.
    const result = validateStatusChange("READY", "BLOCKED");
    expect(result.allowed).toBe(false);
    expect(result).toMatchObject({ error: { code: "TASK_BLOCKED" } });
  });

  it("refuses In progress and Done while the task is still waiting", () => {
    expect(validateStatusChange("IN_PROGRESS", "BLOCKED").allowed).toBe(false);
    expect(validateStatusChange("DONE", "BLOCKED").allowed).toBe(false);
  });

  it("always allows cancelling", () => {
    // A decision about the task, not a claim about the graph — and
    // being blocked is exactly when you would want to.
    expect(validateStatusChange("CANCELLED", "BLOCKED")).toEqual({
      allowed: true,
    });
  });

  it("explains Ready differently from the rest", () => {
    const ready = validateStatusChange("READY", "BLOCKED");
    const started = validateStatusChange("IN_PROGRESS", "BLOCKED");
    if (ready.allowed || started.allowed) throw new Error("expected refusals");

    // "It becomes Ready on its own" is the useful half of the answer,
    // and it only makes sense for Ready.
    expect(ready.error.message).toMatch(/on its own/);
    expect(started.error.message).not.toMatch(/on its own/);
  });
});

describe("canRequestStatus", () => {
  it("offers everything from a state that isn't blocked", () => {
    for (const current of ["READY", "IN_PROGRESS", "DONE", "CANCELLED"] as const) {
      for (const target of SETTABLE_STATUSES) {
        expect(canRequestStatus(current, target)).toBe(true);
      }
    }
  });

  it("offers only Cancel from blocked", () => {
    expect(canRequestStatus("BLOCKED", "CANCELLED")).toBe(true);
    expect(canRequestStatus("BLOCKED", "READY")).toBe(false);
    expect(canRequestStatus("BLOCKED", "IN_PROGRESS")).toBe(false);
    expect(canRequestStatus("BLOCKED", "DONE")).toBe(false);
  });

  it("agrees with validateStatusChange on a blocked task", () => {
    // The client predicate is a courtesy; it must never offer something
    // the server would refuse.
    for (const target of SETTABLE_STATUSES) {
      expect(canRequestStatus("BLOCKED", target)).toBe(
        validateStatusChange(target, "BLOCKED").allowed,
      );
    }
  });
});
