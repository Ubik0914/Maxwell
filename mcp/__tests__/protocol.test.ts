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

  it("offers the library's readers and editors, nothing else", () => {
    expect(TOOLS.map((tool) => tool.name).sort()).toEqual([
      "add_book",
      "append_note",
      "delete_book",
      "get_book",
      "move_books",
      "search_books",
      "set_note",
      "update_book",
      "whoami",
    ]);
  });

  it("marks the readers read-only and what overwrites or removes as destructive", () => {
    const hints = Object.fromEntries(
      TOOLS.map((tool) => [
        tool.name,
        [
          tool.annotations?.readOnlyHint ?? false,
          tool.annotations?.destructiveHint ?? false,
        ],
      ]),
    );
    expect(hints).toEqual({
      whoami: [true, false],
      search_books: [true, false],
      get_book: [true, false],
      append_note: [false, false],
      add_book: [false, false],
      move_books: [false, false],
      set_note: [false, true],
      update_book: [false, true],
      delete_book: [false, true],
    });
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

/**
 * The editors, each a request (or two) to /api/v1. What matters is the
 * method, the path and the body — that they ask the API for exactly the
 * change they were given and nothing more.
 */
describe("the editing tools", () => {
  type Asked = { path: string; method: string; body?: unknown };

  async function run(
    name: string,
    args: Record<string, unknown>,
    reply: (asked: Asked) => unknown = () => ({}),
  ) {
    const asked: Asked[] = [];
    const response = await dispatch(
      {
        jsonrpc: "2.0",
        id: 7,
        method: "tools/call",
        params: { name, arguments: args },
      },
      async (path, { method = "GET", body } = {}) => {
        const request = { path, method, body };
        asked.push(request);
        return reply(request);
      },
    );
    return { asked, response: response as Answer };
  }

  const id = "00000000-0000-4000-8000-000000000001";

  it("append_note reads the note and writes it back with a line added", async () => {
    const { asked } = await run(
      "append_note",
      { bookId: id, text: "2章まで読んだ" },
      ({ method }) => (method === "GET" ? { id, note: "借りた本\n" } : {}),
    );
    expect(asked).toEqual([
      { path: `/api/v1/books/${id}`, method: "GET", body: undefined },
      {
        path: `/api/v1/books/${id}`,
        method: "PATCH",
        body: { note: "借りた本\n2章まで読んだ" },
      },
    ]);
  });

  it("append_note starts the note when there was none", async () => {
    const { asked } = await run(
      "append_note",
      { bookId: id, text: "最初のメモ" },
      ({ method }) => (method === "GET" ? { id, note: null } : {}),
    );
    expect(asked[1].body).toEqual({ note: "最初のメモ" });
  });

  it("set_note replaces the note in one request", async () => {
    const { asked } = await run("set_note", { bookId: id, note: "" });
    expect(asked).toEqual([
      { path: `/api/v1/books/${id}`, method: "PATCH", body: { note: "" } },
    ]);
  });

  it("update_book sends only the fields it was given", async () => {
    const { asked } = await run("update_book", {
      bookId: id,
      location: "会社",
      price: null,
    });
    expect(asked).toEqual([
      {
        path: `/api/v1/books/${id}`,
        method: "PATCH",
        body: { location: "会社", price: null },
      },
    ]);
  });

  it("move_books is one request for every book", async () => {
    const { asked } = await run("move_books", {
      bookIds: [id, "00000000-0000-4000-8000-000000000002"],
      location: "自宅",
    });
    expect(asked).toEqual([
      {
        path: "/api/v1/books",
        method: "PATCH",
        body: {
          bookIds: [id, "00000000-0000-4000-8000-000000000002"],
          location: "自宅",
        },
      },
    ]);
  });

  it("add_book with an ISBN alone asks for a lookup", async () => {
    const { asked } = await run("add_book", {
      isbn: "978-4-15-010229-6",
      location: "自宅",
      price: 900,
    });
    expect(asked).toEqual([
      {
        path: "/api/v1/books",
        method: "POST",
        body: { isbn: "978-4-15-010229-6", location: "自宅" },
      },
    ]);
  });

  it("add_book with a title sends the book as written", async () => {
    const { asked } = await run("add_book", {
      title: "自費出版の本",
      authors: "わたし",
      price: 500,
    });
    expect(asked[0].body).toEqual({
      title: "自費出版の本",
      authors: "わたし",
      price: 500,
    });
  });

  it("add_book with neither says so without a request", async () => {
    const { asked, response } = await run("add_book", { location: "自宅" });
    expect(asked).toEqual([]);
    expect(response.result?.isError).toBe(true);
  });

  it("delete_book sends a DELETE for the one book", async () => {
    const { asked } = await run("delete_book", { bookId: id });
    expect(asked).toEqual([
      { path: `/api/v1/books/${id}`, method: "DELETE", body: undefined },
    ]);
  });
});
