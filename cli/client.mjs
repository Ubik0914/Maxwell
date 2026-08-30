/**
 * The bit of the CLI that talks to Maxwell: where the credentials live,
 * and how a request carries them.
 *
 * It was inside maxwell.mjs until the MCP server needed the same thing.
 * Two programs holding the same token file and the same refresh dance,
 * written twice, would drift — and the second copy would drift silently,
 * because the only symptom is an expired token nobody renewed.
 *
 * Still dependency-free, still Node's own fetch and fs, so `cli/` can be
 * copied somewhere and run with no install step. It is two files now
 * rather than one; they travel together.
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { homedir } from "node:os";
import { join, dirname } from "node:path";
import process from "node:process";

export const CONFIG_DIR = join(homedir(), ".maxwell");
export const CONFIG_PATH = join(CONFIG_DIR, "credentials.json");
export const DEFAULT_URL = "http://localhost:3000";

/** Anything the caller is meant to read rather than a stack trace. */
export class MaxwellError extends Error {}

/* ------------------------------------------------------------------ */
/* Credential store                                                    */
/* ------------------------------------------------------------------ */

export function readCredentials() {
  try {
    return JSON.parse(readFileSync(CONFIG_PATH, "utf8"));
  } catch {
    return null;
  }
}

export function writeCredentials(credentials) {
  mkdirSync(dirname(CONFIG_PATH), { recursive: true, mode: 0o700 });
  // Tokens are as good as the password here, so the file is never
  // readable by anyone else on the machine.
  writeFileSync(CONFIG_PATH, JSON.stringify(credentials, null, 2), {
    mode: 0o600,
  });
}

export function requireCredentials() {
  const credentials = readCredentials();
  if (!credentials?.accessToken) {
    throw new MaxwellError("Not signed in. Run `maxwell login` first.");
  }
  return credentials;
}

/**
 * Which Maxwell to talk to. MAXWELL_URL wins over the URL login
 * remembered, which is what the README has always said and what lets one
 * stored session be pointed at a local build for an afternoon without
 * signing in again.
 */
export function baseUrlFor(credentials) {
  const override = process.env.MAXWELL_URL;
  return (override ?? credentials?.url ?? DEFAULT_URL).replace(/\/$/, "");
}

/* ------------------------------------------------------------------ */
/* HTTP                                                                */
/* ------------------------------------------------------------------ */

export async function callApi(
  path,
  { method = "GET", body, token, baseUrl } = {},
) {
  const response = await fetch(`${baseUrl}${path}`, {
    method,
    headers: {
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }).catch((cause) => {
    throw new MaxwellError(`Could not reach ${baseUrl} — ${cause.message}`);
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
export async function apiRequest(path, options = {}) {
  const credentials = requireCredentials();
  const baseUrl = baseUrlFor(credentials);

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
    throw new MaxwellError(
      error?.message ??
        `Request failed (${attempt.response.status} ${attempt.response.statusText})`,
    );
  }

  return attempt.payload?.data;
}
