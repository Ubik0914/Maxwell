#!/usr/bin/env node
// Synedge MCP サーバー。Web アプリとは独立して起動・デプロイできる。
//   HTTP:  node dist/index.js            （Streamable HTTP, POST /mcp, Bearer 認証）
//   stdio: node dist/index.js --stdio    （ローカルのAIクライアントから起動。SYNEDGE_MCP_TOKEN で認証）
import { createServer } from "node:http";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { createPgRepositories, createSql } from "@synedge/database";
import { webUrl } from "@synedge/mail-core";
import { createCoreServices, createLogger } from "@synedge/mail-core/server";
import { z } from "zod";
import { McpAuthenticator } from "./auth";
import { createHttpHandler } from "./http";
import { createMcpServer } from "./tools";

const stdio = process.argv.includes("--stdio");

const env = z
  .object({
    PORT: z.coerce.number().default(8787),
    DATABASE_URL: z.string().min(1),
    TOKEN_ENCRYPTION_KEYS: z.string().min(1),
    GOOGLE_CLIENT_ID: z.string().min(1),
    GOOGLE_CLIENT_SECRET: z.string().min(1),
    APP_ORIGIN: z.string().url(),
    ALLOWED_EMAILS: z.string().transform((s) => s.split(",").map((x) => x.trim().toLowerCase()).filter(Boolean)),
    MCP_ALLOWED_ORIGINS: z.string().default("").transform((s) => s.split(",").map((x) => x.trim()).filter(Boolean)),
    SYNEDGE_MCP_TOKEN: z.string().optional(),
  })
  .parse(process.env);

// stdio では標準出力が MCP の通信路になるため、ログは標準エラーへ出す
const logger = createLogger({ service: "mcp" }, stdio ? { sink: (line) => process.stderr.write(line + "\n") } : {});
const repos = createPgRepositories(createSql(env.DATABASE_URL, { max: 3 }));
const core = createCoreServices(
  repos,
  {
    oauth: {
      clientId: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      redirectUri: webUrl("/api/auth/google/callback", env.APP_ORIGIN).toString(),
    },
    tokenEncryptionKeys: env.TOKEN_ENCRYPTION_KEYS,
    // MCP は watch / 通知を扱わない
    pubsubTopic: null,
    fcmServiceAccountJson: null,
  },
  { logger },
);
const auth = new McpAuthenticator(repos.mcpTokens, env.ALLOWED_EMAILS, async (id) => (await repos.users.findById(id))?.email ?? null);

if (stdio) {
  const r = await auth.authenticate(`Bearer ${env.SYNEDGE_MCP_TOKEN ?? ""}`);
  if ("error" in r) {
    process.stderr.write("SYNEDGE_MCP_TOKEN が無効です。Synedge の設定画面で発行したトークンを設定してください。\n");
    process.exit(1);
  }
  const server = createMcpServer({ mail: core.mail, userId: r.userId });
  await server.connect(new StdioServerTransport());
} else {
  const server = createServer(createHttpHandler({ mail: core.mail, auth, logger, allowedOrigins: env.MCP_ALLOWED_ORIGINS }));
  server.listen(env.PORT, () => logger.info("mcp.started", { port: env.PORT }));
  const shutdown = () => server.close(() => process.exit(0));
  process.on("SIGTERM", shutdown);
  process.on("SIGINT", shutdown);
}
