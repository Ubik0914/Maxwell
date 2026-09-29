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
    expect(response?.result?.serverInfo?.name).toBe("library");
    expect(response?.result?.instructions).toContain("search_books");
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

  it("offers only the library readers", () => {
    expect(TOOLS.map((tool) => tool.name).sort()).toEqual([
      "get_book",
      "search_books",
      "whoami",
    ]);
  });

  it("marks every tool read-only, and none destructive", () => {
    for (const tool of TOOLS) {
      expect(tool.annotations?.readOnlyHint).toBe(true);
      expect(tool.annotations?.destructiveHint ?? false).toBe(false);
    }
  });
});

describe("tools/call", () => {
  it("refuses a tool it does not have", async () => {
    const response = await request("tools/call", { name: "drop_database" });
    expect(response?.error?.code).toBe(-32601);
  });

  it("says which argument is missing without a round trip", async () => {
    const response = await request("tools/call", {
      name: "get_book",
      arguments: {},
    });
    expect(response?.error?.code).toBe(-32602);
    expect(response?.error?.message).toContain("bookId");
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
    const response = await callWith("search_books", async () => ({
      books: [{ id: "b1", title: "一九八四年" }],
      total: 1,
    }));

    expect(response?.result?.isError).toBeUndefined();
    const [content] = response!.result!.content!;
    expect(content.type).toBe("text");
    expect(JSON.parse(content.text)).toEqual({
      books: [{ id: "b1", title: "一九八四年" }],
      total: 1,
    });
  });

  it("hands the tool whichever way of reaching the API it was given", async () => {
    // What makes one catalogue serve both transports: the tool is
    // handed the request function rather than closing over one, so the
    // stdio server's token-carrying client and /api/mcp's forwarded
    // request are the same tool doing the same thing.
    const asked: string[] = [];
    const call = async (path: string) => {
      asked.push(path);
      return { id: "u1", email: "a@b.c" };
    };

    const response = await dispatch(
      {
        jsonrpc: "2.0",
        id: 9,
        method: "tools/call",
        params: { name: "whoami", arguments: {} },
      },
      call,
    );

    expect(asked).toEqual(["/api/v1/me"]);
    const text = (response as Answer).result!.content![0].text;
    expect(JSON.parse(text)).toEqual({ userId: "u1", email: "a@b.c" });
  });

  it("reports a failed call as a result, not as a transport error", async () => {
    // A book that no longer exists, an expired token: facts about the
    // world the model should see and can act on. As a JSON-RPC error
    // the host might swallow them before the model ever heard.
    const response = await callWith(
      "get_book",
      async () => {
        throw new Error("Book not found.");
      },
      { bookId: "gone" },
    );

    expect(response?.error).toBeUndefined();
    expect(response?.result?.isError).toBe(true);
    expect(response?.result?.content?.[0]?.text).toBe("Book not found.");
  });
});

/**
 * search_books is a query string builder over GET /api/v1/books. What
 * matters is that it asks for exactly what it was given — and nothing
 * for what it was not, so the API's own defaults stay the defaults.
 */
describe("search_books", () => {
  async function pathFor(args: Record<string, unknown>) {
    const asked: string[] = [];
    const call: CallApi = async (path) => {
      asked.push(path);
      return { books: [], total: 0 };
    };
    await dispatch(
      {
        jsonrpc: "2.0",
        id: 4,
        method: "tools/call",
        params: { name: "search_books", arguments: args },
      },
      call,
    );
    return asked[0];
  }

  it("lists the whole shelf when given nothing", async () => {
    expect(await pathFor({})).toBe("/api/v1/books");
  });

  it("passes the query, sort and limit through", async () => {
    const path = new URL(
      await pathFor({
        query: "orwell 早川",
        sort: "title",
        limit: 5,
      }),
      "http://x",
    );
    expect(path.pathname).toBe("/api/v1/books");
    expect(Object.fromEntries(path.searchParams)).toEqual({
      q: "orwell 早川",
      sort: "title",
      limit: "5",
    });
  });
});

describe("get_book", () => {
  it("asks for the book by id", async () => {
    const asked: string[] = [];
    await dispatch(
      {
        jsonrpc: "2.0",
        id: 5,
        method: "tools/call",
        params: { name: "get_book", arguments: { bookId: "b-1" } },
      },
      async (path) => {
        asked.push(path);
        return { id: "b-1" };
      },
    );
    expect(asked).toEqual(["/api/v1/books/b-1"]);
  });
});

describe("the catalogue", () => {
  it("names every tool once", () => {
    const names = TOOLS.map((tool) => tool.name);
    expect(new Set(names).size).toBe(names.length);
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
