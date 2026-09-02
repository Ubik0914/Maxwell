import {
  handle as dispatch,
  TOOLS,
  PROTOCOL_VERSIONS,
  type CallApi,
  type Tool,
  type ToolSchema,
} from "../maxwell-mcp.mjs";

/**
 * The MCP server is plain JavaScript for the same reason the CLI is —
 * no build step, no dependencies, runnable from wherever a host points
 * at it — so the shapes live in maxwell-mcp.d.mts beside it. What a
 * result carries is narrowed here, because `handle` is declared to
 * return the envelope and the payload is per-method.
 */
interface Answer {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: {
    protocolVersion?: string;
    serverInfo?: { name: string; version: string };
    capabilities?: { tools?: unknown };
    instructions?: string;
    tools?: { name: string; description: string; inputSchema: ToolSchema }[];
    content?: { type: string; text: string }[];
    isError?: boolean;
  };
  error?: { code: number; message: string };
}

const handle = dispatch as (message: unknown) => Promise<Answer | null>;

const request = (method: string, params?: unknown) =>
  handle({ jsonrpc: "2.0", id: 1, method, params });

describe("initialize", () => {
  it("answers with a version, the tools capability and who it is", async () => {
    const response = await request("initialize", {
      protocolVersion: PROTOCOL_VERSIONS[0],
      capabilities: {},
      clientInfo: { name: "test", version: "0" },
    });

    expect(response?.result?.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
    expect(response?.result?.capabilities?.tools).toBeDefined();
    expect(response?.result?.serverInfo?.name).toBe("maxwell");
    expect(response?.result?.instructions).toContain("BLOCKED");
  });

  it("agrees to an older version the client asks for", async () => {
    const old = PROTOCOL_VERSIONS[PROTOCOL_VERSIONS.length - 1];
    const response = await request("initialize", { protocolVersion: old });
    expect(response?.result?.protocolVersion).toBe(old);
  });

  it("offers its own version rather than one it has never heard of", async () => {
    const response = await request("initialize", {
      protocolVersion: "1999-01-01",
    });
    expect(response?.result?.protocolVersion).toBe(PROTOCOL_VERSIONS[0]);
  });
});

describe("notifications", () => {
  // A reply to a notification is a protocol violation, not a spare line:
  // some hosts match responses to ids and one with no id is a hang.
  it.each([
    "notifications/initialized",
    "notifications/cancelled",
    "something/unheard-of",
  ])("says nothing back to %s", async (method) => {
    expect(await handle({ jsonrpc: "2.0", method })).toBeNull();
  });
});

describe("tools/list", () => {
  it("lists every tool with a schema a client can fill in", async () => {
    const listed = (await request("tools/list"))?.result?.tools ?? [];
    expect(listed).toHaveLength(TOOLS.length);

    for (const tool of listed) {
      expect(tool.name).toMatch(/^[a-z][a-z_]*$/);
      expect(tool.description.length).toBeGreaterThan(20);
      expect(tool.inputSchema.type).toBe("object");
      for (const key of tool.inputSchema.required ?? []) {
        expect(tool.inputSchema.properties).toHaveProperty(key);
      }
    }
  });

  it("does not leak the half of a tool the model can't use", async () => {
    const listed = (await request("tools/list"))?.result?.tools ?? [];
    for (const tool of listed) {
      expect(tool).not.toHaveProperty("run");
    }
  });

  it("marks the tools that only read as read-only", () => {
    const readers = ["whoami", "list_workspaces", "list_stories", "get_story", "get_frontier"];
    for (const tool of TOOLS) {
      expect(tool.annotations?.readOnlyHint ?? false).toBe(
        readers.includes(tool.name),
      );
    }
  });

  it("marks the tools that destroy something as destructive", () => {
    const destroyers = TOOLS.filter(
      (tool) => tool.annotations?.destructiveHint,
    ).map((tool) => tool.name);
    expect(destroyers.sort()).toEqual(["delete_task", "disconnect_tasks"]);
  });
});

describe("tools/call", () => {
  it("refuses a tool it does not have", async () => {
    const response = await request("tools/call", { name: "drop_database" });
    expect(response?.error?.code).toBe(-32601);
  });

  it("says which argument is missing without a round trip", async () => {
    const response = await request("tools/call", {
      name: "set_task_status",
      arguments: { taskId: "a" },
    });
    expect(response?.error?.code).toBe(-32602);
    expect(response?.error?.message).toContain("status");
  });

  /**
   * Dispatch holds the very objects in TOOLS, so swapping one's `run`
   * is enough to drive a call to either ending without a network or a
   * stored token in the way.
   */
  async function callWith(
    name: string,
    run: Tool["run"],
    args: Record<string, unknown> = {},
  ) {
    const tool = TOOLS.find((candidate) => candidate.name === name)!;
    const original = tool.run;
    tool.run = run;
    try {
      return await request("tools/call", { name, arguments: args });
    } finally {
      tool.run = original;
    }
  }

  it("hands back what the tool returned, as text and as data", async () => {
    const response = await callWith("list_workspaces", async () => [
      { workspaceId: "w1", name: "Home", role: "OWNER" },
    ]);

    expect(response?.result?.isError).toBeUndefined();
    const [content] = response!.result!.content!;
    expect(content.type).toBe("text");
    expect(JSON.parse(content.text)).toEqual([
      { workspaceId: "w1", name: "Home", role: "OWNER" },
    ]);
  });

  it("hands the tool whichever way of reaching the API it was given", async () => {
    // What makes one catalogue serve both transports: the tool is
    // handed the request function rather than closing over one, so the
    // stdio server's token-carrying client and /api/mcp's forwarded
    // request are the same tool doing the same thing.
    const asked: string[] = [];
    const call = async (path: string) => {
      asked.push(path);
      return path === "/api/v1/me"
        ? { id: "u1", email: "a@b.c" }
        : [{ workspaceId: "w1" }];
    };

    const response = await dispatch(
      { jsonrpc: "2.0", id: 9, method: "tools/call", params: { name: "whoami", arguments: {} } },
      call,
    );

    expect(asked.sort()).toEqual(["/api/v1/me", "/api/v1/workspaces"]);
    const text = (response as Answer).result!.content![0].text;
    expect(JSON.parse(text)).toEqual({
      userId: "u1",
      email: "a@b.c",
      workspaces: 1,
    });
  });

  it("reports a failed call as a result, not as a transport error", async () => {
    // A task that no longer exists, a connection that would close a
    // cycle, an expired token: facts about the world the model should
    // see and can act on. As a JSON-RPC error the host might swallow
    // them before the model ever heard.
    const response = await callWith("delete_task", async () => {
      throw new Error("Task not found.");
    }, { taskId: "gone" });

    expect(response?.error).toBeUndefined();
    expect(response?.result?.isError).toBe(true);
    expect(response?.result?.content?.[0]?.text).toBe("Task not found.");
  });
});

/**
 * A task is a step on a path from START to GOAL. The tool says so, and
 * this is the half of that promise the model cannot get wrong: a call
 * that names no dependency is wired to START rather than left floating.
 */
describe("create_task builds from START", () => {
  function recorder(nodes: { id: string; type: string }[]) {
    const seen: { path: string; body?: unknown }[] = [];
    const call = async (
      path: string,
      options: { method?: string; body?: unknown } = {},
    ) => {
      seen.push({ path, body: options.body });
      if (path.endsWith("/graph")) return { nodes, edges: [] };
      if (path.endsWith("/tasks")) return { id: "task-1", title: "First" };
      if (path.endsWith("/edges")) return { id: "edge-1" };
      return null;
    };
    return { seen, call };
  }

  const create = (args: Record<string, unknown>, call: CallApi) =>
    dispatch(
      {
        jsonrpc: "2.0",
        id: 3,
        method: "tools/call",
        params: { name: "create_task", arguments: { storyId: "s1", title: "First", ...args } },
      },
      call,
    );

  it("connects a task that named no dependency to the story's START", async () => {
    const { seen, call } = recorder([
      { id: "start-1", type: "START" },
      { id: "goal-1", type: "GOAL" },
    ]);

    await create({}, call);

    const edges = seen.filter((request) => request.path.endsWith("/edges"));
    expect(edges).toHaveLength(1);
    expect(edges[0].body).toEqual({
      sourceNodeId: "start-1",
      targetNodeId: "task-1",
    });
  });

  it("leaves the dependencies alone when the caller gave some", async () => {
    const { seen, call } = recorder([{ id: "start-1", type: "START" }]);

    await create({ dependsOn: ["task-0"] }, call);

    // No graph read either: nothing to look up, and a story's graph is
    // the most expensive call here.
    expect(seen.some((request) => request.path.endsWith("/graph"))).toBe(false);
    const edges = seen.filter((request) => request.path.endsWith("/edges"));
    expect(edges.map((edge) => edge.body)).toEqual([
      { sourceNodeId: "task-0", targetNodeId: "task-1" },
    ]);
  });

  it("still creates the task when the story has no START to hang it on", async () => {
    const { seen, call } = recorder([{ id: "goal-1", type: "GOAL" }]);

    const response = await create({}, call);

    expect((response as Answer).result?.isError).toBeUndefined();
    expect(seen.some((request) => request.path.endsWith("/edges"))).toBe(false);
  });
});

describe("the catalogue", () => {
  it("names every tool once", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it("never offers to set BLOCKED, which the graph derives", () => {
    const status = TOOLS.find((tool) => tool.name === "set_task_status")!;
    const allowed = status.inputSchema.properties!.status as { enum: string[] };
    expect(allowed.enum).not.toContain("BLOCKED");
  });

  it("has no sign-in tool — a password is not a tool argument", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(names).not.toContain("login");
    for (const tool of TOOLS) {
      expect(Object.keys(tool.inputSchema.properties ?? {})).not.toContain(
        "password",
      );
    }
  });
});
