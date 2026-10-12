// Streamable HTTP（ステートレス）での MCP 提供
import { randomUUID } from "node:crypto";
import type { IncomingMessage, ServerResponse } from "node:http";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import type { Logger, MailService } from "@synedge/mail-core/server";
import type { McpAuthenticator } from "./auth";
import { createMcpServer } from "./tools";

const MAX_BODY = 1024 * 1024;

export interface HttpDeps {
  mail: MailService;
  auth: McpAuthenticator;
  logger: Logger;
  /** ブラウザからの接続を許可する Origin（DNSリバインディング対策）。未指定ならブラウザ Origin 付きの要求を拒否 */
  allowedOrigins: string[];
}

function sendJson(res: ServerResponse, status: number, body: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { "content-type": "application/json", ...headers });
  res.end(JSON.stringify(body));
}

function rpcError(res: ServerResponse, status: number, message: string, headers?: Record<string, string>) {
  sendJson(res, status, { jsonrpc: "2.0", error: { code: -32001, message }, id: null }, headers);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = [];
  let size = 0;
  for await (const c of req) {
    size += (c as Buffer).length;
    if (size > MAX_BODY) throw new Error("too_large");
    chunks.push(c as Buffer);
  }
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

export function createHttpHandler(deps: HttpDeps) {
  return async (req: IncomingMessage, res: ServerResponse) => {
    const path = (req.url ?? "/").split("?")[0];
    if (req.method === "GET" && path === "/healthz") return sendJson(res, 200, { ok: true });
    if (path !== "/mcp") return sendJson(res, 404, { error: "not_found" });

    const origin = req.headers.origin;
    if (origin && !deps.allowedOrigins.includes(origin)) return rpcError(res, 403, "Origin not allowed");
    if (req.method !== "POST") {
      // ステートレス運用のため GET（SSEストリーム）/DELETE（セッション終了）は提供しない
      return rpcError(res, 405, "Method not allowed", { allow: "POST" });
    }

    const auth = await deps.auth.authenticate(req.headers.authorization);
    if ("error" in auth) {
      return auth.error === "rate_limited"
        ? rpcError(res, 429, "Too many requests")
        : rpcError(res, 401, "Unauthorized", { "www-authenticate": 'Bearer realm="synedge-mcp"' });
    }

    let body: unknown;
    try {
      body = await readJson(req);
    } catch {
      return sendJson(res, 400, { jsonrpc: "2.0", error: { code: -32700, message: "Parse error" }, id: null });
    }

    const correlationId = randomUUID();
    const server = createMcpServer({ mail: deps.mail, userId: auth.userId });
    const transport = new StreamableHTTPServerTransport({ sessionIdGenerator: undefined, enableJsonResponse: true });
    res.on("close", () => {
      void transport.close();
      void server.close();
    });
    try {
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      const method = (body as { method?: unknown })?.method;
      deps.logger.info("mcp.request", { correlationId, tokenId: auth.tokenId, method: typeof method === "string" ? method : "batch" });
    } catch (e) {
      deps.logger.error("mcp.failed", { correlationId, error: e });
      if (!res.headersSent) rpcError(res, 500, "Internal error");
    }
  };
}
