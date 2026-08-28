import { parseArgs as parseArgsUntyped } from "../maxwell.mjs";

/**
 * The CLI is plain JavaScript on purpose — no build step, no
 * dependencies, copyable anywhere Node runs — so its exports arrive
 * untyped. The shape is asserted once here rather than at each call.
 */
type Parsed = {
  positional: string[];
  flags: Record<string, string | true>;
};
const parseArgs = parseArgsUntyped as (argv: string[]) => Parsed;

describe("parseArgs", () => {
  it("keeps bare words as positional arguments", () => {
    expect(parseArgs(["task", "status", "abc-123", "DONE"])).toEqual({
      positional: ["task", "status", "abc-123", "DONE"],
      flags: {},
    });
  });

  it("reads a flag written as --name value", () => {
    expect(parseArgs(["stories", "--workspace", "w1"])).toEqual({
      positional: ["stories"],
      flags: { workspace: "w1" },
    });
  });

  it("reads a flag written as --name=value", () => {
    expect(parseArgs(["stories", "--workspace=w1"])).toEqual({
      positional: ["stories"],
      flags: { workspace: "w1" },
    });
  });

  it("keeps everything after the first = in an inline value", () => {
    // Titles and URLs both contain "=" often enough that splitting on
    // every one of them would quietly truncate real input.
    const { flags } = parseArgs(["login", "--url=https://x.dev/?a=1&b=2"]);
    expect(flags.url).toBe("https://x.dev/?a=1&b=2");
  });

  it("treats a flag with no value as a switch", () => {
    expect(parseArgs(["workspaces", "--json"])).toEqual({
      positional: ["workspaces"],
      flags: { json: true },
    });
  });

  it("does not swallow the next flag as a value", () => {
    expect(parseArgs(["story", "s1", "--json", "--help"])).toEqual({
      positional: ["story", "s1"],
      flags: { json: true, help: true },
    });
  });

  it("handles a value that follows a switch-like flag", () => {
    const { positional, flags } = parseArgs([
      "task",
      "add",
      "s1",
      "--title",
      "Write the thing",
      "--json",
    ]);
    expect(positional).toEqual(["task", "add", "s1"]);
    expect(flags).toEqual({ title: "Write the thing", json: true });
  });
});
