/**
 * Types for the MCP server, which is plain JavaScript so that `mcp/`
 * stays copyable and runnable with no build step. The app imports it
 * (see /api/mcp) and wants the shapes.
 */

/** How a tool reaches /api/v1. Supplied by whichever transport is in use. */
export type CallApi = (
  path: string,
  options?: { method?: string; body?: unknown },
) => Promise<unknown>;

export interface ToolSchema {
  type: string;
  properties?: Record<string, unknown>;
  required?: string[];
  additionalProperties?: boolean;
}

/**
 * Hints to the host about what a tool does — whether it may be run
 * without asking, whether it destroys something. Hints, not
 * enforcement.
 */
export interface ToolAnnotations {
  readOnlyHint?: boolean;
  destructiveHint?: boolean;
  idempotentHint?: boolean;
  openWorldHint?: boolean;
}

export interface Tool {
  name: string;
  title: string;
  description: string;
  inputSchema: ToolSchema;
  annotations?: ToolAnnotations;
  run: (args: Record<string, unknown>, call: CallApi) => Promise<unknown>;
}

export const TOOLS: Tool[];

export interface JsonRpcResponse {
  jsonrpc: "2.0";
  id: string | number | null;
  result?: unknown;
  error?: { code: number; message: string };
}

/**
 * Answers one JSON-RPC message, or null for a notification — those have
 * no id and take no reply.
 */
export function handle(
  message: unknown,
  call?: CallApi,
): Promise<JsonRpcResponse | null>;

export const PROTOCOL_VERSIONS: string[];
export const SERVER: { name: string; version: string };
