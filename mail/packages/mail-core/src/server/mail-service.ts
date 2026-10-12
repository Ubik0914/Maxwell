// メール操作のユースケース層（仕様4章 MailService）。Web API と MCP は必ずここを通す。
// 入力検証・所有者チェック・エラー共通化・二重送信防止を担う。
import { z } from "zod";
import { displayName, formatAddress, parseAddressList, sameEmail, uniqueAddresses } from "../address";
import { MailError } from "../errors";
import { quoteForReply } from "../quote";
import {
  draftInputSchema,
  firstIssueMessage,
  listQuerySchema,
  providerIdSchema,
  replyModeSchema,
  searchQuerySchema,
  sendInputSchema,
  type DraftInput,
  type ReplyMode,
} from "../schemas";
import type { DraftDetail, DraftSummary, Page, SendResult, ThreadDetail, ThreadSummary } from "../types";
import type { Logger } from "./logger";
import { buildReferences, generateMessageId, replySubject, type OutgoingMessage } from "./mime";
import type { AccountRecord, AccountRepository, SendRepository } from "./ports";
import type { MailProvider, ProviderFactory } from "./provider";

export interface MailContext {
  userId: string;
}

export interface MailServiceDeps {
  accounts: AccountRepository;
  sends: SendRepository;
  providerFactory: ProviderFactory;
  logger: Logger;
}

function parse<T extends z.ZodTypeAny>(schema: T, input: unknown): z.infer<T> {
  const r = schema.safeParse(input);
  if (!r.success) throw new MailError("INVALID_INPUT", firstIssueMessage(r.error));
  return r.data;
}

export interface ReplyDraft {
  to: string[];
  cc: string[];
  subject: string;
  threadId: string;
  replyToMessageId: string;
  /** 返信本文の末尾に付ける引用（UIで編集可） */
  quotedOriginal: string;
  original: { from: string; date: string; text: string };
}

export class MailService {
  constructor(private readonly deps: MailServiceDeps) {}

  /** 本人の接続済みアカウントを解決する。他ユーザーのアカウントには到達できない */
  async resolveAccount(ctx: MailContext): Promise<AccountRecord> {
    const accounts = await this.deps.accounts.listByUser(ctx.userId);
    const account = accounts[0];
    if (!account) throw new MailError("NOT_CONNECTED");
    if (account.userId !== ctx.userId) throw new MailError("FORBIDDEN");
    if (account.status !== "active") throw new MailError("REAUTH_REQUIRED");
    return account;
  }

  private async provider(ctx: MailContext): Promise<{ account: AccountRecord; provider: MailProvider }> {
    const account = await this.resolveAccount(ctx);
    return { account, provider: this.deps.providerFactory(account) };
  }

  async listInbox(ctx: MailContext, input: unknown): Promise<Page<ThreadSummary>> {
    const q = parse(listQuerySchema, input);
    const { provider } = await this.provider(ctx);
    return provider.listThreads({ inboxOnly: true, pageToken: q.cursor, limit: q.limit });
  }

  async search(ctx: MailContext, input: unknown): Promise<Page<ThreadSummary>> {
    const q = parse(searchQuerySchema, input);
    const { provider } = await this.provider(ctx);
    if (!provider.capabilities.search) throw new MailError("UNSUPPORTED");
    return provider.listThreads({ query: q.q, inboxOnly: false, pageToken: q.cursor, limit: q.limit });
  }

  async getThread(ctx: MailContext, threadId: string, opts: { allowRemoteImages?: boolean } = {}): Promise<ThreadDetail> {
    const id = parse(providerIdSchema, threadId);
    const { provider } = await this.provider(ctx);
    return provider.getThread(id, { allowRemoteImages: opts.allowRemoteImages === true });
  }

  async setRead(ctx: MailContext, threadId: string, read: boolean): Promise<void> {
    const id = parse(providerIdSchema, threadId);
    const { provider } = await this.provider(ctx);
    await provider.setThreadRead(id, read);
  }

  async archive(ctx: MailContext, threadId: string): Promise<void> {
    const id = parse(providerIdSchema, threadId);
    const { provider } = await this.provider(ctx);
    if (!provider.capabilities.archive) throw new MailError("UNSUPPORTED");
    await provider.archiveThread(id);
  }

  async listDrafts(ctx: MailContext, input: unknown): Promise<Page<DraftSummary>> {
    const q = parse(listQuerySchema, input);
    const { provider } = await this.provider(ctx);
    if (!provider.capabilities.drafts) throw new MailError("UNSUPPORTED");
    return provider.listDrafts({ pageToken: q.cursor, limit: q.limit });
  }

  async getDraft(ctx: MailContext, draftId: string): Promise<DraftDetail> {
    const id = parse(providerIdSchema, draftId);
    const { provider } = await this.provider(ctx);
    return provider.getDraft(id);
  }

  async createDraft(ctx: MailContext, input: unknown): Promise<{ draftId: string; threadId: string | null }> {
    const d = parse(draftInputSchema, input);
    const { provider } = await this.provider(ctx);
    const { msg, threadId } = await this.toOutgoing(provider, d);
    const r = await provider.createDraft(msg, threadId);
    return { draftId: r.draftId, threadId: r.threadId };
  }

  async updateDraft(ctx: MailContext, draftId: string, input: unknown): Promise<{ draftId: string }> {
    const id = parse(providerIdSchema, draftId);
    const d = parse(draftInputSchema, input);
    const { provider } = await this.provider(ctx);
    const { msg, threadId } = await this.toOutgoing(provider, d);
    const r = await provider.updateDraft(id, msg, threadId);
    return { draftId: r.draftId };
  }

  /**
   * 送信。ユーザーが明示的に操作した場合のみ Web API から呼ぶ（MCPからは呼ばない）。
   * idempotencyKey で二重送信を防ぎ、結果不明時は自動再送しない。
   */
  async send(ctx: MailContext, input: unknown): Promise<SendResult> {
    const s = parse(sendInputSchema, input);
    const { account, provider } = await this.provider(ctx);
    const rfc822 = generateMessageId();
    const { created, record } = await this.deps.sends.begin(ctx.userId, s.idempotencyKey, rfc822);
    if (!created) {
      if (record.status === "sent") {
        return { status: "sent", messageId: record.messageId, threadId: record.threadId, rfc822MessageId: record.rfc822MessageId };
      }
      if (record.status === "pending") throw new MailError("SEND_IN_PROGRESS");
      if (record.status === "unknown") throw new MailError("SEND_STATUS_UNKNOWN");
      // failed：確定的に失敗した送信。同じキーで再送させず新しいキーを要求する
      throw new MailError("SEND_FAILED", "前回の送信は失敗しました。もう一度送信ボタンを押してください。");
    }

    const log = this.deps.logger.child({ accountId: account.id });
    try {
      const { msg, threadId } = await this.toOutgoing(provider, s);
      msg.messageId = rfc822;
      let result: { messageId: string; threadId: string };
      if (s.draftId) {
        await provider.updateDraft(s.draftId, msg, threadId);
        result = await provider.sendDraft(s.draftId);
      } else {
        result = await provider.sendMessage(msg, threadId);
      }
      await this.deps.sends.finish(ctx.userId, s.idempotencyKey, { status: "sent", ...result });
      log.info("mail.sent");
      return { status: "sent", messageId: result.messageId, threadId: result.threadId, rfc822MessageId: rfc822 };
    } catch (e) {
      const err = e instanceof MailError ? e : new MailError("INTERNAL", undefined, { cause: e });
      // 応答が返らなかった（タイムアウト・通信断・5xx）場合は、Google側で送信済みの可能性がある
      const ambiguous = ["TIMEOUT", "NETWORK", "PROVIDER_UNAVAILABLE", "INTERNAL"].includes(err.code);
      await this.deps.sends.finish(ctx.userId, s.idempotencyKey, {
        status: ambiguous ? "unknown" : "failed",
        errorCode: err.code,
      });
      log.warn("mail.send_failed", { errorCode: err.code, ambiguous });
      if (ambiguous) throw new MailError("SEND_STATUS_UNKNOWN", undefined, { cause: err });
      if (["REAUTH_REQUIRED", "INSUFFICIENT_SCOPE", "RATE_LIMITED", "INVALID_INPUT", "NOT_FOUND"].includes(err.code)) throw err;
      throw new MailError("SEND_FAILED", undefined, { cause: err, detail: err.code });
    }
  }

  /** 送信状態の再確認。unknown の場合は送信済みフォルダを Message-ID で照合する */
  async getSendStatus(ctx: MailContext, idempotencyKey: string): Promise<SendResult> {
    const key = parse(z.string().uuid(), idempotencyKey);
    const record = await this.deps.sends.get(ctx.userId, key);
    if (!record) throw new MailError("NOT_FOUND");
    if (record.status === "unknown" || record.status === "pending") {
      const { provider } = await this.provider(ctx);
      const found = await provider.findSentByRfc822Id(record.rfc822MessageId);
      if (found) {
        await this.deps.sends.finish(ctx.userId, key, { status: "sent", ...found });
        return { status: "sent", ...found, rfc822MessageId: record.rfc822MessageId };
      }
    }
    return {
      status: record.status,
      messageId: record.messageId,
      threadId: record.threadId,
      rfc822MessageId: record.rfc822MessageId,
    };
  }

  /** 返信・全員に返信の宛先と引用を組み立てる（UIの返信ボタンとMCP draft_reply が共用） */
  async prepareReply(ctx: MailContext, messageId: string, mode: ReplyMode): Promise<ReplyDraft> {
    const id = parse(providerIdSchema, messageId);
    const m = parse(replyModeSchema, mode);
    const { account, provider } = await this.provider(ctx);
    const src = await provider.getReplySource(id);
    const self = account.email;

    const from = parseAddressList(src.from);
    const replyTo = parseAddressList(src.replyTo);
    const origTo = parseAddressList(src.to);
    const origCc = parseAddressList(src.cc);
    const sentBySelf = from.some((a) => sameEmail(a.email, self));

    // 自分が送ったメールへの返信は元の宛先へ返す
    const primary = sentBySelf ? origTo : replyTo.length ? replyTo : from;
    const to = uniqueAddresses(primary, sentBySelf ? [] : [self]);
    const cc = m === "replyAll" ? uniqueAddresses([...(sentBySelf ? [] : origTo), ...origCc], [self, ...to.map((a) => a.email)]) : [];

    const date = new Date(src.date);
    const attribution = `${formatDateJa(date)} ${displayName(from[0])} <${from[0]?.email ?? ""}>:`;
    return {
      to: (to.length ? to : from).map(formatAddress),
      cc: cc.map(formatAddress),
      subject: replySubject(src.subject),
      threadId: src.threadId,
      replyToMessageId: src.messageId,
      quotedOriginal: src.text ? quoteForReply(src.text.trimEnd(), attribution) : "",
      original: { from: src.from ?? "", date: src.date, text: src.text ?? "" },
    };
  }

  private async toOutgoing(provider: MailProvider, d: DraftInput): Promise<{ msg: OutgoingMessage; threadId?: string }> {
    let inReplyTo: string | null = null;
    let references: string | null = null;
    let threadId = d.threadId;
    if (d.replyToMessageId) {
      const src = await provider.getReplySource(d.replyToMessageId);
      inReplyTo = src.rfc822MessageId;
      references = buildReferences(src.references, src.rfc822MessageId);
      threadId = src.threadId;
    }
    return {
      msg: { to: d.to, cc: d.cc, bcc: d.bcc, subject: d.subject, body: d.body, inReplyTo, references },
      threadId,
    };
  }
}

function formatDateJa(d: Date): string {
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("ja-JP", {
    timeZone: "Asia/Tokyo",
    year: "numeric",
    month: "numeric",
    day: "numeric",
    weekday: "short",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
