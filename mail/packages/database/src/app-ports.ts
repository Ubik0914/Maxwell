// アプリ（Web/MCP）固有の永続化ポート。メール処理とは無関係な認証まわりのデータ。

export interface HandoffRepository {
  create(codeHash: string, userId: string, expiresAt: Date): Promise<void>;
  /** 未使用・期限内なら使用済みにして userId を返す（1回限り） */
  consume(codeHash: string, now: Date): Promise<string | null>;
}

export interface McpTokenRecord {
  id: string;
  userId: string;
  name: string;
  tokenPrefix: string;
  createdAt: Date;
  lastUsedAt: Date | null;
  revokedAt: Date | null;
}

export interface McpTokenRepository {
  create(userId: string, name: string, tokenHash: string, tokenPrefix: string): Promise<McpTokenRecord>;
  list(userId: string): Promise<McpTokenRecord[]>;
  revoke(userId: string, id: string): Promise<boolean>;
  findActiveByHash(tokenHash: string): Promise<McpTokenRecord | null>;
  touch(id: string): Promise<void>;
  revokeAllForUser(userId: string): Promise<void>;
}

export interface AppRepositories {
  handoff: HandoffRepository;
  mcpTokens: McpTokenRepository;
}
