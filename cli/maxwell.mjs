#!/usr/bin/env node
/**
 * maxwell — the task graph, from the terminal.
 *
 * Deliberately dependency-free: Node's own fetch, readline and fs are
 * enough, so the CLI can be copied somewhere and run without an install
 * step, and it can never drift out of step with the app's lockfile.
 *
 * It knows one thing about the world — a base URL — and discovers the
 * rest through /api/v1. Credentials live in ~/.maxwell/credentials.json
 * at mode 0600, and an expired access token is refreshed and the request
 * retried once, so a long-lived shell session doesn't keep asking for a
 * password.
 */

import { createInterface } from "node:readline";
import { readFileSync, writeFileSync, mkdirSync, rmSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import process from "node:process";

const CONFIG_DIR = join(homedir(), ".maxwell");
const CONFIG_PATH = join(CONFIG_DIR, "credentials.json");
const DEFAULT_URL = "http://localhost:3000";

const STATUS_GLYPH = {
  DONE: "✔",
  READY: "●",
  IN_PROGRESS: "◍",
  BLOCKED: "✖",
  CANCELLED: "—",
};

const TASK_STATUSES = ["READY", "IN_PROGRESS", "DONE", "CANCELLED"];

// Colour only when someone is actually watching; piped output stays clean.
const tty = process.stdout.isTTY;
const ESC = "\u001b";
const paint = (code) => (text) =>
  tty ? `${ESC}[${code}m${text}${ESC}[0m` : String(text);
const dim = paint("2");
const bold = paint("1");
const cyan = paint("36");
const green = paint("32");
const yellow = paint("33");
const red = paint("31");

const STATUS_PAINT = {
  DONE: green,
  READY: cyan,
  IN_PROGRESS: yellow,
  BLOCKED: red,
  CANCELLED: dim,
};

class CliError extends Error {}

/* ------------------------------------------------------------------ */
/* Credential store                                                    */
/* ------------------------------------------------------------------ */

function readCredentials() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

function writeCredentials(credentials) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  // Tokens are as good as the password here, so the file is never
  // readable by anyone else on the machine.
  writeFileSync(CONFIG_PATH, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}

function requireCredentials() {
  const credentials = readCredentials();
  if (!credentials?.accessToken) {
    throw new CliError("Not signed in. Run `maxwell login` first.");
  }
  return credentials;
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

async function callApi(path, { method = "GET", body, token, baseUrl } = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((cause) => {
    throw new CliError(`Could not reach ${baseUrl} — ${cause.message}`);
  });

  const payload = await response.json().catch(() => null);
  return { response, payload };
}

/**
 * An API call as the signed-in user, refreshing once if the token has
 * aged out. The retry is deliberately single: a second 401 means the
 * refresh token is finished too, and looping would just be a slower way
 * of saying so.
 */
async function apiRequest(path, options = {}) {
  const credentials = requireCredentials();
  const baseUrl = credentials.url;

  let attempt = await callApi(path, {
    ...options,
    token: credentials.accessToken,
    baseUrl,
  });

  if (attempt.response.status === 401 && credentials.refreshToken) {
    const refreshed = await callApi("/api/v1/auth/token", {
      method: "POST",
      body: { refreshToken: credentials.refreshToken },
      baseUrl,
    });

    if (refreshed.response.ok && refreshed.payload?.data) {
      const next = { ...credentials, ...refreshed.payload.data };
      writeCredentials(next);
      attempt = await callApi(path, {
        ...options,
        token: next.accessToken,
        baseUrl,
      });
    }
  }

  if (!attempt.response.ok) {
    const error = attempt.payload?.error;
    throw new CliError(
      error?.message ??
        `Request failed (${attempt.response.status} ${attempt.response.statusText})`,
    );
  }

  return attempt.payload?.data;
}

/* ------------------------------------------------------------------ */
/* Prompting                                                           */
/* ------------------------------------------------------------------ */

function ask(question, { hidden = false } = {}) {
  const rl = createInterface({ input: process.stdin, output: process.stdout });

  return new Promise((resolve) => {
    if (hidden) {
      // readline echoes as you type. Overriding its writer so that only
      // the prompt itself reaches the terminal is what keeps a password
      // out of the scrollback.
      rl._writeToOutput = (text) => {
        if (text.includes(question)) process.stdout.write(text);
      };
    }
    rl.question(question, (answer) => {
      if (hidden) process.stdout.write("\n");
      rl.close();
      resolve(answer.trim());
    });
  });
}

/* ------------------------------------------------------------------ */
/* Argument parsing                                                    */
/* ------------------------------------------------------------------ */

/**
 * Splits `--flag value` / `--flag=value` out of the positional
 * arguments. Small on purpose: the commands here take a handful of
 * named strings and nothing that needs a parser library.
 */
export function parseArgs(argv) {
  const positional = [];
  const flags = {};

  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (!arg.startsWith("--")) {
      positional.push(arg);
      continue;
    }

    const [name, inline] = arg.slice(2).split(/=(.*)/s);
    if (inline !== undefined) {
      flags[name] = inline;
    } else if (argv[i + 1] !== undefined && !argv[i + 1].startsWith("--")) {
      flags[name] = argv[i + 1];
      i += 1;
    } else {
      flags[name] = true;
    }
  }

  return { positional, flags };
}

/* ------------------------------------------------------------------ */
/* Rendering                                                           */
/* ------------------------------------------------------------------ */

function statusLabel(status) {
  const glyph = STATUS_GLYPH[status] ?? "·";
  const colour = STATUS_PAINT[status] ?? dim;
  return `${colour(glyph)} ${colour(status.padEnd(11))}`;
}

/**
 * A graph is not a tree, so this doesn't pretend to draw one. Each task
 * gets a line with its state and what it is waiting on, which is the
 * question you actually have in a terminal — and the ids stay visible
 * because the next thing you do is paste one into another command.
 */
function renderGraph(graph) {
  const titleById = new Map(graph.nodes.map((node) => [node.id, node.title]));
  const incoming = new Map();
  for (const edge of graph.edges) {
    const list = incoming.get(edge.targetNodeId) ?? [];
    list.push(titleById.get(edge.sourceNodeId) ?? "?");
    incoming.set(edge.targetNodeId, list);
  }

  const lines = [];
  const { story, stats } = graph;
  lines.push(`${bold(story.title)}  ${dim(story.status)}`);
  lines.push(
    dim(
      `${stats.done} done · ${stats.ready} ready · ${stats.inProgress} in progress · ${stats.blocked} blocked`,
    ),
  );
  lines.push("");

  const start = graph.nodes.find((node) => node.type === "START");
  const goal = graph.nodes.find((node) => node.type === "GOAL");
  if (start) lines.push(`  ${cyan("○")} ${bold("START")}  ${start.title}`);

  for (const node of graph.nodes.filter((n) => n.type === "TASK")) {
    lines.push(`  ${statusLabel(node.status ?? "READY")} ${node.title}  ${dim(node.id)}`);
    const waits = incoming.get(node.id);
    if (waits?.length) lines.push(dim(`      ← ${waits.join(", ")}`));
  }

  if (goal) {
    const reached = (incoming.get(goal.id) ?? []).length > 0 &&
      graph.edges
        .filter((edge) => edge.targetNodeId === goal.id)
        .every((edge) => {
          const source = graph.nodes.find((n) => n.id === edge.sourceNodeId);
          return source?.status === "DONE";
        });
    const paintGoal = reached ? green : dim;
    lines.push(`  ${paintGoal("◎")} ${paintGoal("GOAL")}   ${goal.title}`);
    const waits = incoming.get(goal.id);
    if (waits?.length) lines.push(dim(`      ← ${waits.join(", ")}`));
  }

  return lines.join("\n");
}

function renderFrontier(frontier) {
  if (frontier.length === 0) {
    return dim("Nothing is actionable right now.");
  }
  return frontier
    .map(
      (node) =>
        `  ${statusLabel(node.status)} ${node.title}  ${dim(node.id)}`,
    )
    .join("\n");
}

/* ------------------------------------------------------------------ */
/* Commands                                                            */
/* ------------------------------------------------------------------ */

const USAGE = `maxwell — the task graph, from the terminal

  maxwell login [--url <base-url>]      sign in and store a token
  maxwell logout                        forget the stored token
  maxwell whoami                        who the stored token belongs to

  maxwell workspaces                    workspaces you belong to
  maxwell stories --workspace <id>      stories in a workspace
  maxwell story <story-id>              the whole graph
  maxwell frontier <story-id>           what can be started right now

  maxwell task add <story-id> --title <t> [--description <d>]
  maxwell task status <task-id> <${TASK_STATUSES.join("|")}>

Add --json to any command for machine-readable output.
The base URL is remembered from login; MAXWELL_URL overrides it.`;

const commands = {
  async login(_positional, flags) {
    const url = (
      flags.url ??
      process.env.MAXWELL_URL ??
      readCredentials()?.url ??
      DEFAULT_URL
    ).replace(/\/$/, "");

    const email = flags.email ?? (await ask("Email: "));
    const password = flags.password ?? (await ask("Password: ", { hidden: true }));

    const { response, payload } = await callApi("/api/v1/auth/token", {
      method: "POST",
      body: { email, password },
      baseUrl: url,
    });

    if (!response.ok) {
      throw new CliError(payload?.error?.message ?? "Sign-in failed.");
    }

    writeCredentials({ url, ...payload.data });
    return { signedInAs: payload.data.user.email, url };
  },

  async logout() {
    rmSync(CONFIG_PATH, { force: true });
    return { signedOut: true };
  },

  async whoami() {
    const credentials = requireCredentials();
    // Round-trips on purpose: the point of `whoami` is whether the
    // stored token still works, not what the file says about it.
    const workspaces = await apiRequest("/api/v1/workspaces");
    return {
      email: credentials.user?.email ?? null,
      url: credentials.url,
      workspaces: workspaces.length,
    };
  },

  async workspaces() {
    return apiRequest("/api/v1/workspaces");
  },

  async stories(_positional, flags) {
    const workspaceId = flags.workspace ?? flags.workspaceId;
    if (!workspaceId) {
      throw new CliError(
        "Which workspace? Pass --workspace <id> (see `maxwell workspaces`).",
      );
    }
    return apiRequest(
      `/api/v1/stories?workspaceId=${encodeURIComponent(workspaceId)}`,
    );
  },

  async story([storyId]) {
    if (!storyId) throw new CliError("Usage: maxwell story <story-id>");
    return apiRequest(`/api/v1/stories/${storyId}/graph`);
  },

  async frontier([storyId]) {
    if (!storyId) throw new CliError("Usage: maxwell frontier <story-id>");
    const graph = await apiRequest(`/api/v1/stories/${storyId}/graph`);
    return graph.frontier;
  },

  async task([action, id, value], flags) {
    if (action === "add") {
      if (!id) throw new CliError("Usage: maxwell task add <story-id> --title <title>");
      if (!flags.title) throw new CliError("--title is required.");
      return apiRequest(`/api/v1/stories/${id}/tasks`, {
        method: "POST",
        body: {
          title: flags.title,
          ...(flags.description ? { description: flags.description } : {}),
        },
      });
    }

    if (action === "status") {
      if (!id || !value) {
        throw new CliError(
          `Usage: maxwell task status <task-id> <${TASK_STATUSES.join("|")}>`,
        );
      }
      const status = value.toUpperCase();
      if (!TASK_STATUSES.includes(status)) {
        throw new CliError(
          `Unknown status "${value}". One of: ${TASK_STATUSES.join(", ")}`,
        );
      }
      return apiRequest(`/api/v1/tasks/${id}/status`, {
        method: "PATCH",
        body: { status },
      });
    }

    throw new CliError("Usage: maxwell task <add|status> …");
  },
};

/** How each command's result reads when a human, not a pipe, is looking. */
const renderers = {
  login: (data) => `Signed in as ${bold(data.signedInAs)} at ${dim(data.url)}`,
  logout: () => "Signed out.",
  whoami: (data) =>
    `${bold(data.email ?? "unknown")}\n${dim(data.url)}\n${data.workspaces} workspace(s)`,
  workspaces: (data) =>
    data.length === 0
      ? dim("No workspaces yet.")
      : data
          .map((m) => `  ${bold(m.name)}  ${dim(m.role)}  ${dim(m.workspaceId)}`)
          .join("\n"),
  stories: (data) =>
    data.length === 0
      ? dim("No stories yet.")
      : data
          .map(
            (s) =>
              `  ${bold(s.title)}  ${dim(s.status)}  ${dim(s.id)}\n${dim(
                `      ${s.stats.done} done · ${s.stats.ready} ready · ${s.stats.blocked} blocked`,
              )}`,
          )
          .join("\n"),
  story: renderGraph,
  frontier: renderFrontier,
  task: (data) =>
    data?.task
      ? `${green("✔")} ${bold(data.task.title)} → ${statusLabel(data.task.status).trim()}` +
        (data.affectedTasks?.length
          ? `\n${dim(`  ${data.affectedTasks.length} downstream task(s) re-evaluated`)}`
          : "")
      : `${green("✔")} ${bold(data?.title ?? "done")}  ${dim(data?.id ?? "")}`,
};

/* ------------------------------------------------------------------ */
/* Entry point                                                         */
/* ------------------------------------------------------------------ */

async function main(argv) {
  const { positional, flags } = parseArgs(argv);
  const [name, ...rest] = positional;

  if (!name || flags.help || name === "help") {
    process.stdout.write(`${USAGE}\n`);
    return 0;
  }

  const command = commands[name];
  if (!command) {
    process.stderr.write(`${red("Unknown command")} "${name}"\n\n${USAGE}\n`);
    return 1;
  }

  const data = await command(rest, flags);

  if (flags.json) {
    process.stdout.write(`${JSON.stringify(data, null, 2)}\n`);
  } else {
    const render = renderers[name];
    process.stdout.write(`${render ? render(data) : JSON.stringify(data)}\n`);
  }
  return 0;
}

// Importable for tests; only runs the CLI when invoked as one.
if (process.argv[1] && process.argv[1].endsWith("maxwell.mjs")) {
  main(process.argv.slice(2))
    .then((code) => process.exit(code))
    .catch((error) => {
      process.stderr.write(
        `${red("error")} ${error instanceof CliError ? error.message : error}\n`,
      );
      process.exit(1);
    });
}

export { main };
