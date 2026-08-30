#!/usr/bin/env node
/**
 * maxwell-mcp — Maxwell as a set of tools a model can call.
 *
 * An MCP server over stdio: JSON-RPC 2.0, one message per line, requests
 * in on stdin and responses out on stdout. Nothing else may be written
 * to stdout — a stray console.log is a protocol error — so everything
 * diagnostic goes to stderr.
 *
 * It is a client of /api/v1 and nothing more, exactly as the CLI is.
 * There is no second code path into the graph here: the same endpoints,
 * the same token from ~/.maxwell/credentials.json, the same RLS. A model
 * driving this can reach precisely the rows the person who ran
 * `maxwell login` could reach, which is the property that makes handing
 * it to an agent reasonable in the first place.
 *
 * Sign-in is deliberately not a tool. Passwords should not arrive as
 * tool arguments — they would land in a transcript, and a model has no
 * business holding one. `maxwell login` happens once, in a terminal,
 * and this reads what it left behind.
 *
 * The SDK is deliberately not a dependency either. The stdio transport
 * is newline-delimited JSON-RPC and the three methods that matter are
 * initialize, tools/list and tools/call; implementing them directly
 * keeps `mcp/` and `cli/` the same kind of thing — plain Node, no
 * install step, nothing to keep in step with a lockfile.
 */

import process from "node:process";
import { createInterface } from "node:readline";
import {
  MaxwellError,
  apiRequest,
  baseUrlFor,
  readCredentials,
} from "../cli/client.mjs";

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
const INSTRUCTIONS = `Maxwell is a task graph: a story is a DAG running from START to GOAL.

An edge means "must happen first". A task with an unfinished task before
it is BLOCKED, and it becomes READY by itself the moment the last thing
it waits on is DONE — so BLOCKED is derived, never set. set_task_status
accepts READY, IN_PROGRESS, DONE and CANCELLED only.

get_story is the one call worth making first: it returns every node and
edge with its id, the tallies, and the frontier — the tasks that could
be started right now. Ids are what every other tool takes.

Everything acts as the signed-in user, so it can reach exactly what they
can. Anything it cannot see returns "not found" rather than saying so.`;

const TASK_STATUSES = ["READY", "IN_PROGRESS", "DONE", "CANCELLED"];

/* ------------------------------------------------------------------ */
/* Tools                                                               */
/* ------------------------------------------------------------------ */

const string = (description) => ({ type: "string", description });
const uuid = (description) => ({
  type: "string",
  format: "uuid",
  description,
});

/**
 * The graph's vocabulary, one verb at a time.
 *
 * These are named for what someone would ask for — connect_tasks, not
 * create_edge — because the name is most of what a model has to go on
 * when it is choosing between twelve of them. The descriptions say when
 * to reach for one, not what it does to the database.
 *
 * `annotations` are hints, not enforcement: a host may use readOnlyHint
 * to run something without asking and destructiveHint to insist on
 * asking, and getting them wrong is how an agent deletes something on a
 * confirmation nobody saw.
 */
const TOOLS = [
  {
    name: "whoami",
    title: "Who am I",
    description:
      "Which Maxwell account these tools are acting as, and whether its stored token still works. Start here if a call comes back unauthorised.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run() {
      const credentials = readCredentials();
      // Round-trips on purpose: the question is whether the stored token
      // still works, not what the file says about it.
      const workspaces = await apiRequest("/api/v1/workspaces");
      return {
        email: credentials?.user?.email ?? null,
        // Where the calls actually went, which MAXWELL_URL can make a
        // different place from the one login remembered.
        url: baseUrlFor(credentials),
        workspaces: workspaces.length,
      };
    },
  },

  {
    name: "list_workspaces",
    title: "List workspaces",
    description:
      "The workspaces this account belongs to, with its role in each. Every story lives in one, so this is where a workspaceId comes from.",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: () => apiRequest("/api/v1/workspaces"),
  },

  {
    name: "list_stories",
    title: "List stories",
    description:
      "Every story in a workspace, with its status and how far its tasks have got.",
    inputSchema: {
      type: "object",
      properties: { workspaceId: uuid("From list_workspaces.") },
      required: ["workspaceId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: ({ workspaceId }) =>
      apiRequest(`/api/v1/stories?workspaceId=${encodeURIComponent(workspaceId)}`),
  },

  {
    name: "get_story",
    title: "Get a story's graph",
    description:
      "The whole story: every node and edge with its id, the tallies, and the frontier. Read this before changing anything — it is where the ids the other tools need come from.",
    inputSchema: {
      type: "object",
      properties: { storyId: uuid("From list_stories.") },
      required: ["storyId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    run: ({ storyId }) => apiRequest(`/api/v1/stories/${storyId}/graph`),
  },

  {
    name: "get_frontier",
    title: "Get what can be started",
    description:
      "The tasks that could be picked up right now — nothing unfinished stands in front of them. The answer to \"what should I do next\".",
    inputSchema: {
      type: "object",
      properties: { storyId: uuid("From list_stories.") },
      required: ["storyId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, openWorldHint: true },
    async run({ storyId }) {
      const graph = await apiRequest(`/api/v1/stories/${storyId}/graph`);
      return graph.frontier;
    },
  },

  {
    name: "create_story",
    title: "Create a story",
    description:
      "A new story, empty but for its START and GOAL. Both states are required: a story is the distance between where things are and where they should be, and it cannot be drawn without both ends.",
    inputSchema: {
      type: "object",
      properties: {
        workspaceId: uuid("From list_workspaces."),
        title: string("What the story is called."),
        startState: string("Where things stand today."),
        goalState: string("What being finished looks like."),
        description: string("Optional. Markdown is fine."),
      },
      required: ["workspaceId", "title", "startState", "goalState"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: (input) =>
      apiRequest("/api/v1/stories", { method: "POST", body: input }),
  },

  {
    name: "create_task",
    title: "Add a task",
    description:
      "Adds a task, and optionally wires it in at the same time: `dependsOn` are the nodes that must finish first, `blocks` the ones that wait on it. Building a graph a task at a time is the ordinary way to use this — pass the GOAL's id in `blocks` for anything the story ends with. Without a position it is placed clear of what is already there; the app's auto-layout arranges it properly.",
    inputSchema: {
      type: "object",
      properties: {
        storyId: uuid("The story to add it to."),
        title: string("What the task is."),
        description: string("Optional. Markdown is fine."),
        dependsOn: {
          type: "array",
          items: uuid("A node that must be DONE first."),
          description:
            "Node ids this task waits on. Leaving it empty makes the task READY immediately.",
        },
        blocks: {
          type: "array",
          items: uuid("A node that waits on this one."),
          description: "Node ids that cannot start until this task is done.",
        },
        position: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y"],
          description: "Optional canvas coordinates.",
          additionalProperties: false,
        },
      },
      required: ["storyId", "title"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    async run({ storyId, title, description, position, dependsOn, blocks }) {
      const task = await apiRequest(`/api/v1/stories/${storyId}/tasks`, {
        method: "POST",
        body: {
          title,
          ...(description ? { description } : {}),
          ...(position ? { position } : {}),
        },
      });

      // The task exists from here on, so a connection that fails is
      // reported rather than thrown: telling the model the whole call
      // failed would invite it to create the task a second time.
      const wanted = [
        ...(dependsOn ?? []).map((id) => ({
          sourceNodeId: id,
          targetNodeId: task.id,
        })),
        ...(blocks ?? []).map((id) => ({
          sourceNodeId: task.id,
          targetNodeId: id,
        })),
      ];

      const connected = [];
      const refused = [];
      for (const edge of wanted) {
        try {
          const created = await apiRequest(`/api/v1/stories/${storyId}/edges`, {
            method: "POST",
            body: edge,
          });
          connected.push({ id: created.id, ...edge });
        } catch (error) {
          refused.push({ ...edge, reason: messageFor(error) });
        }
      }

      return {
        ...task,
        ...(connected.length > 0 ? { connected } : {}),
        ...(refused.length > 0 ? { refused } : {}),
      };
    },
  },

  {
    name: "update_task",
    title: "Edit a task",
    description:
      "Changes a task's title, description, priority or due date. Status is not settable here — use set_task_status, which re-derives what the change unblocks.",
    inputSchema: {
      type: "object",
      properties: {
        taskId: uuid("From get_story."),
        title: string("New title."),
        description: {
          type: ["string", "null"],
          description: "New description; null clears it.",
        },
        priority: {
          type: ["integer", "null"],
          minimum: 1,
          maximum: 4,
          description: "1 is highest, 4 lowest; null clears it.",
        },
        dueDate: {
          type: ["string", "null"],
          description: "YYYY-MM-DD, or null to clear it.",
        },
      },
      required: ["taskId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: ({ taskId, ...patch }) =>
      apiRequest(`/api/v1/tasks/${taskId}`, { method: "PATCH", body: patch }),
  },

  {
    name: "set_task_status",
    title: "Move a task",
    description: `Moves a task to ${TASK_STATUSES.join(", ")}. Marking one DONE re-derives everything downstream, so tasks that were only waiting on it come back READY — the reply lists which ones moved. BLOCKED cannot be set: it is what the graph works out.`,
    inputSchema: {
      type: "object",
      properties: {
        taskId: uuid("From get_story."),
        status: { type: "string", enum: TASK_STATUSES },
      },
      required: ["taskId", "status"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: true, openWorldHint: true },
    run: ({ taskId, status }) =>
      apiRequest(`/api/v1/tasks/${taskId}/status`, {
        method: "PATCH",
        body: { status },
      }),
  },

  {
    name: "delete_task",
    title: "Delete a task",
    description:
      "Removes a task and every connection through it. Nothing is kept. To take something off the board without losing it, set its status to CANCELLED instead.",
    inputSchema: {
      type: "object",
      properties: { taskId: uuid("From get_story.") },
      required: ["taskId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    run: ({ taskId }) =>
      apiRequest(`/api/v1/tasks/${taskId}`, { method: "DELETE" }),
  },

  {
    name: "connect_tasks",
    title: "Connect two tasks",
    description:
      "Makes the target wait on the source. Refused if it would close a cycle — a story has to be able to finish.",
    inputSchema: {
      type: "object",
      properties: {
        storyId: uuid("The story both nodes are in."),
        sourceNodeId: uuid("The one that happens first."),
        targetNodeId: uuid("The one that waits."),
      },
      required: ["storyId", "sourceNodeId", "targetNodeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, openWorldHint: true },
    run: ({ storyId, sourceNodeId, targetNodeId }) =>
      apiRequest(`/api/v1/stories/${storyId}/edges`, {
        method: "POST",
        body: { sourceNodeId, targetNodeId },
      }),
  },

  {
    name: "disconnect_tasks",
    title: "Remove a connection",
    description:
      "Deletes one dependency, leaving both tasks in place. Whatever the connection was holding back is re-derived, so a task waiting on nothing else becomes READY.",
    inputSchema: {
      type: "object",
      properties: { edgeId: uuid("From get_story's edges.") },
      required: ["edgeId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true, openWorldHint: true },
    run: ({ edgeId }) =>
      apiRequest(`/api/v1/edges/${edgeId}`, { method: "DELETE" }),
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
 * Returns null for a notification — those have no id and take no reply,
 * and answering one anyway is a protocol violation rather than a
 * harmless extra line.
 *
 * The two kinds of failure are kept apart on purpose. A JSON-RPC error
 * means the call was malformed or the tool does not exist: the client
 * has a bug. A tool that ran and failed comes back as an ordinary
 * result carrying isError, because that is a fact about the world the
 * model should see and can act on — a task that no longer exists, a
 * connection that would have made a cycle — rather than a transport
 * fault the host might swallow before the model ever hears about it.
 */
export async function handle(message) {
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
        const data = await tool.run(args);
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
