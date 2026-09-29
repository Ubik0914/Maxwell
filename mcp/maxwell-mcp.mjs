#!/usr/bin/env node
/**
 * maxwell-mcp — Maxwell as a set of tools a model can call.
 *
 * Run as a program it is an MCP server over stdio: JSON-RPC 2.0, one
 * message per line, requests in on stdin and responses out on stdout.
 * Nothing else may be written to stdout — a stray console.log is a
 * protocol error — so everything diagnostic goes to stderr.
 *
 * Imported, it is the same tools and the same dispatch with the
 * transport left out, which is what /api/mcp serves over HTTP. The
 * tools take the function that reaches the API as an argument rather
 * than closing over one, so there is one catalogue and one `handle`,
 * and a tool cannot behave differently depending on how it was reached.
 *
 * What it offers is the library at "/", read-only: searching the
 * signed-in user's books and reading one. Maxwell's own graph tools
 * were withdrawn from here; the graph is still reachable over /api/v1
 * and the CLI.
 *
 * It is a client of /api/v1 and nothing more, exactly as the CLI is.
 * There is no second code path into the data here: the same endpoints,
 * the same bearer token, the same RLS. A model driving this can reach
 * precisely the rows the person whose token it is could reach, which is
 * the property that makes handing it to an agent reasonable at all.
 *
 * Sign-in is deliberately not a tool. Passwords should not arrive as
 * tool arguments — they would land in a transcript, and a model has no
 * business holding one. Over stdio, `maxwell login` happens once in a
 * terminal and this reads what it left behind; over HTTP the token
 * arrives on the request and this never sees a password at all.
 *
 * The SDK is deliberately not a dependency either. The stdio transport
 * is newline-delimited JSON-RPC and the three methods that matter are
 * initialize, tools/list and tools/call; implementing them directly
 * keeps `mcp/` and `cli/` the same kind of thing — plain Node, no
 * install step, nothing to keep in step with a lockfile.
 */

import process from "node:process";
import { createInterface } from "node:readline";
import { MaxwellError, apiRequest, readCredentials } from "../cli/client.mjs";

const SERVER = { name: "maxwell", version: "0.1.0" };

/**
 * Protocol versions this speaks. A client asks for one in `initialize`;
 * if it is on the list it gets its own back, and if it is not it gets
 * the newest here and decides for itself whether to continue. That is
 * the negotiation the spec asks for, and the reason not to simply echo
 * whatever arrives: agreeing to a version you have never heard of is
 * how a server ends up silently wrong rather than loudly incompatible.
 */
const PROTOCOL_VERSIONS = ["2025-06-18", "2025-03-26", "2024-11-05"];

/** What the model is told about this server once, on connection. */
const INSTRUCTIONS = `This server reads the signed-in user's personal library: the books
they own, where each one is, whether it has been read, and who it is
lent to. It only reads — nothing here adds, changes or removes a book.

search_books is the call to start with. With no query it lists the
shelf, newest first; with one, every word must appear somewhere in the
title, author, publisher, ISBN, location, borrower or note, in any
order, with full/half width, case and katakana/hiragana treated alike.
Its reply carries \`total\` (how many matched before the limit) and
\`stats\` for the whole shelf, so an empty page and a truncated one
can be told apart. get_book returns one book by the id search_books
gave it.

reading_status is UNREAD, READING or READ. A book with lent_to set is
out on loan to that person; null means it is at home.

Everything acts as the signed-in user, so it can reach exactly the
books they own. A book it cannot see returns "not found" rather than
saying so.`;

const READING_STATUSES = ["UNREAD", "READING", "READ"];
const SORTS = ["recent", "title", "author", "published"];

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

const uuid = (description) => ({
  type: "string",
  format: "uuid",
  description,
});

/**
 * The library, read-only.
 *
 * Maxwell's graph tools used to live here and were withdrawn: the one
 * thing this server now offers is looking books up. Every tool is a
 * reader, and says so in `annotations`, so a host can run them without
 * stopping to ask — there is nothing here that could destroy anything.
 */
const READ_ONLY = { readOnlyHint: true, openWorldHint: true };

const TOOLS = [
  {
    name: "whoami",
    title: "Who am I",
    description:
      "Which account these tools are acting as, and whether its stored token still works. Start here if a call comes back unauthorised.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: READ_ONLY,
    async run(_args, call) {
      // Asks the server rather than reading a file: the question is
      // whether this token still works and for whom, and only the auth
      // server knows.
      const me = await call("/api/v1/me");
      return { userId: me.id, email: me.email };
    },
  },

  {
    name: "search_books",
    title: "Search the library",
    description:
      "Finds books on the user's shelf. With no query, lists them all (newest first). With one, every word must appear somewhere — title, author, publisher, ISBN, location, borrower or note. Filter by reading status or to books out on loan. The reply includes how many matched in total and counts for the whole shelf.",
    inputSchema: {
      type: "object",
      properties: {
        query: {
          type: "string",
          description:
            'Words to look for, space-separated, e.g. "orwell 早川" or an ISBN. Leave out to list everything.',
        },
        status: {
          type: "string",
          enum: ["ALL", "LENT", ...READING_STATUSES],
          description:
            "UNREAD, READING or READ; LENT for books out on loan. Defaults to ALL.",
        },
        sort: {
          type: "string",
          enum: SORTS,
          description:
            "recent (added newest first, the default), title, author, or published (newest first).",
        },
        limit: {
          type: "integer",
          minimum: 1,
          maximum: 500,
          description: "At most this many books. Defaults to 50.",
        },
      },
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run({ query, status, sort, limit }, call) {
      const params = new URLSearchParams();
      if (query) params.set("q", query);
      if (status) params.set("status", status);
      if (sort) params.set("sort", sort);
      if (limit !== undefined) params.set("limit", String(limit));
      const qs = params.toString();
      return call(`/api/v1/books${qs ? `?${qs}` : ""}`);
    },
  },

  {
    name: "get_book",
    title: "Get a book",
    description:
      "Everything recorded about one book — including its note — by the id search_books returned.",
    inputSchema: {
      type: "object",
      properties: { bookId: uuid("From search_books.") },
      required: ["bookId"],
      additionalProperties: false,
    },
    annotations: READ_ONLY,
    run: ({ bookId }, call) =>
      call(`/api/v1/books/${encodeURIComponent(bookId)}`),
  },
];

const BY_NAME = new Map(TOOLS.map((tool) => [tool.name, tool]));

/** The catalogue, without the halves of a tool only this file uses. */
function describe({ name, title, description, inputSchema, annotations }) {
  return { name, title, description, inputSchema, annotations };
}

/* ------------------------------------------------------------------ */
/* JSON-RPC                                                            */
/* ------------------------------------------------------------------ */

const METHOD_NOT_FOUND = -32601;
const INVALID_PARAMS = -32602;
const INTERNAL_ERROR = -32603;
const PARSE_ERROR = -32700;

function messageFor(error) {
  return error instanceof MaxwellError || error instanceof Error
    ? error.message
    : String(error);
}

/**
 * Whether a call has the arguments its schema says are required.
 *
 * Only that, and only at the top level. The API validates properly with
 * Zod on the other side of the request and its messages are better than
 * anything reimplemented here would be; the point of this check is to
 * turn "required field missing" into an answer without a round trip,
 * because that is the one a model makes by accident.
 */
function missingFrom(schema, args) {
  return (schema.required ?? []).filter(
    (key) => args[key] === undefined || args[key] === null,
  );
}

/**
 * Answers one message.
 *
 * `call` is how a tool reaches the API — the only thing that differs
 * between the two transports. Over stdio it is the CLI's own client,
 * carrying the token from ~/.maxwell/credentials.json; inside the app
 * (see /api/mcp) it is a request carrying whatever bearer token the
 * caller arrived with. The tools are written once and know about
 * neither.
 *
 * Returns null for a notification — those have no id and take no reply,
 * and answering one anyway is a protocol violation rather than a
 * harmless extra line.
 *
 * The two kinds of failure are kept apart on purpose. A JSON-RPC error
 * means the call was malformed or the tool does not exist: the client
 * has a bug. A tool that ran and failed comes back as an ordinary
 * result carrying isError, because that is a fact about the world the
 * model should see and can act on — a book that no longer exists, an
 * expired token — rather than a transport
 * fault the host might swallow before the model ever hears about it.
 */
export async function handle(message, call = apiRequest) {
  const { id, method, params = {} } = message ?? {};
  const isRequest = id !== undefined && id !== null;
  const ok = (result) => (isRequest ? { jsonrpc: "2.0", id, result } : null);
  const fail = (code, msg) =>
    isRequest ? { jsonrpc: "2.0", id, error: { code, message: msg } } : null;

  switch (method) {
    case "initialize": {
      const asked = params.protocolVersion;
      return ok({
        protocolVersion: PROTOCOL_VERSIONS.includes(asked)
          ? asked
          : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER,
        instructions: INSTRUCTIONS,
      });
    }

    case "ping":
      return ok({});

    case "tools/list":
      return ok({ tools: TOOLS.map(describe) });

    case "tools/call": {
      const tool = BY_NAME.get(params.name);
      if (!tool) return fail(METHOD_NOT_FOUND, `No such tool: ${params.name}`);

      const args = params.arguments ?? {};
      const missing = missingFrom(tool.inputSchema, args);
      if (missing.length > 0) {
        return fail(
          INVALID_PARAMS,
          `${tool.name} needs ${missing.join(", ")}.`,
        );
      }

      try {
        const data = await tool.run(args, call);
        return ok({
          content: [{ type: "text", text: JSON.stringify(data ?? null, null, 2) }],
          structuredContent: { data: data ?? null },
        });
      } catch (error) {
        return ok({
          content: [{ type: "text", text: messageFor(error) }],
          isError: true,
        });
      }
    }

    default:
      // Notifications land here too — notifications/initialized and
      // notifications/cancelled among them — and correctly produce
      // nothing, because they have no id.
      return isRequest
        ? fail(METHOD_NOT_FOUND, `Unknown method: ${method}`)
        : null;
  }
}

/* ------------------------------------------------------------------ */
/* stdio transport                                                     */
/* ------------------------------------------------------------------ */

function send(message) {
  // One line, no embedded newlines: that is the whole framing.
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function serve() {
  const lines = createInterface({ input: process.stdin });

  lines.on("line", (line) => {
    if (line.trim() === "") return;

    let message;
    try {
      message = JSON.parse(line);
    } catch {
      send({
        jsonrpc: "2.0",
        id: null,
        error: { code: PARSE_ERROR, message: "Invalid JSON" },
      });
      return;
    }

    handle(message)
      .then((response) => {
        if (response) send(response);
      })
      .catch((error) => {
        // handle() is meant to absorb everything; if one gets past it,
        // the client still deserves an answer rather than a hang.
        const id = message?.id;
        if (id === undefined || id === null) return;
        send({
          jsonrpc: "2.0",
          id,
          error: { code: INTERNAL_ERROR, message: messageFor(error) },
        });
      });
  });

  // stdin closing is the host going away, which is the ordinary way
  // this ends.
  lines.on("close", () => process.exit(0));
}

if (process.argv[1] && process.argv[1].endsWith("maxwell-mcp.mjs")) {
  if (!readCredentials()?.accessToken) {
    // stderr, where a host shows a server's startup trouble. Not fatal:
    // the tools each say the same thing, and exiting here would look
    // like a broken server rather than one waiting to be signed in.
    process.stderr.write(
      "maxwell-mcp: no stored credentials — run `maxwell login` first.\n",
    );
  }
  serve();
}

export { TOOLS, PROTOCOL_VERSIONS, SERVER };
