// テスト・ローカル検証用のインメモリ実装
import { randomUUID } from "node:crypto";
import { createMemoryRepositories } from "@synedge/mail-core/testing";
import type { AppRepositories, HandoffRepository, McpTokenRecord, McpTokenRepository } from "./app-ports";

export class MemoryHandoff implements HandoffRepository {
  private readonly rows = new Map<string, { userId: string; expiresAt: Date; used: boolean }>();
  async create(codeHash: string, userId: string, expiresAt: Date) {
    this.rows.set(codeHash, { userId, expiresAt, used: false });
  }
  async consume(codeHash: string, now: Date) {
    const r = this.rows.get(codeHash);
    if (!r || r.used || r.expiresAt <= now) return null;
    r.used = true;
    return r.userId;
  }
}

export class MemoryMcpTokens implements McpTokenRepository {
  readonly rows = new Map<string, McpTokenRecord & { tokenHash: string }>();
  async create(userId: string, name: string, tokenHash: string, tokenPrefix: string) {
    const r = { id: randomUUID(), userId, name, tokenPrefix, tokenHash, createdAt: new Date(), lastUsedAt: null, revokedAt: null };
    this.rows.set(r.id, r);
    return strip(r);
  }
  async list(userId: string) {
    return [...this.rows.values()].filter((r) => r.userId === userId && !r.revokedAt).map(strip);
  }
  async revoke(userId: string, id: string) {
    const r = this.rows.get(id);
    if (!r || r.userId !== userId || r.revokedAt) return false;
    r.revokedAt = new Date();
    return true;
  }
  async findActiveByHash(tokenHash: string) {
    const r = [...this.rows.values()].find((x) => x.tokenHash === tokenHash && !x.revokedAt);
    return r ? strip(r) : null;
  }
  async touch(id: string) {
    const r = this.rows.get(id);
    if (r) r.lastUsedAt = new Date();
  }
  async revokeAllForUser(userId: string) {
    for (const r of this.rows.values()) if (r.userId === userId && !r.revokedAt) r.revokedAt = new Date();
  }
}

function strip(r: McpTokenRecord & { tokenHash: string }): McpTokenRecord {
  const { tokenHash: _h, ...rest } = r;
  return { ...rest };
}

export function createMemoryAppRepositories(now?: () => Date) {
  const core = createMemoryRepositories(now);
  const app: AppRepositories = { handoff: new MemoryHandoff(), mcpTokens: new MemoryMcpTokens() };
  return { ...core, ...app };
}
