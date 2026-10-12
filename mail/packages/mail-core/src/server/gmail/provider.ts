// MailProvider / MailboxChangeFeed の Gmail 実装。Gmail API 固有の処理はこのディレクトリに閉じ込める。
import { parseAddress, parseAddressList, uniqueAddresses } from "../../address";
import { MailError } from "../../errors";
import type { DraftDetail, DraftSummary, Page, ProviderCapabilities, ThreadDetail, ThreadSummary } from "../../types";
import { mapLimit } from "../backoff";
import { buildMimeMessage, toBase64Url, type OutgoingMessage } from "../mime";
import type { ChangedMessage, MailboxChangeFeed, MailProvider, MessageMeta, ReplySource } from "../provider";
import { GmailClient } from "./client";
import { collectParts, decodeHtmlEntities, header, internalDateIso, toMessageView, type GmailMessage } from "./parse";

interface ThreadsListResponse {
  threads?: { id: string; snippet?: string }[];
  nextPageToken?: string;
}
interface GmailThread {
  id: string;
  messages?: GmailMessage[];
}
interface DraftsListResponse {
  drafts?: { id: string; message: { id: string; threadId: string } }[];
  nextPageToken?: string;
}
interface GmailDraft {
  id: string;
  message: GmailMessage;
}
interface HistoryResponse {
  history?: { messagesAdded?: { message: { id: string; threadId: string; labelIds?: string[] } }[] }[];
  nextPageToken?: string;
  historyId: string;
}

const METADATA_HEADERS = ["From", "To", "Subject", "Date"];
const FETCH_CONCURRENCY = 5;
/** 通知対象から除くラベル */
const NON_NOTIFY_LABELS = new Set(["DRAFT", "SENT", "SPAM", "TRASH"]);

export class GmailProvider implements MailProvider, MailboxChangeFeed {
  readonly id = "gmail" as const;
  readonly capabilities: ProviderCapabilities = { search: true, drafts: true, archive: true, pushNotifications: true };

  constructor(private readonly client: GmailClient) {}

  // ---- 一覧・スレッド ----

  async listThreads(opts: { query?: string; inboxOnly: boolean; pageToken?: string; limit: number }): Promise<Page<ThreadSummary>> {
    const res = await this.client.request<ThreadsListResponse>("/threads", {
      query: {
        maxResults: opts.limit,
        pageToken: opts.pageToken,
        q: opts.query,
        labelIds: opts.inboxOnly ? ["INBOX"] : undefined,
      },
    });
    const threads = res.threads ?? [];
    const items = await mapLimit(threads, FETCH_CONCURRENCY, async (t) => {
      try {
        const full = await this.client.request<GmailThread>(`/threads/${enc(t.id)}`, {
          query: { format: "metadata", metadataHeaders: METADATA_HEADERS },
        });
        return toThreadSummary(full, t.snippet);
      } catch (e) {
        // 一覧取得中に削除されたスレッドは除外する
        if (e instanceof MailError && e.code === "NOT_FOUND") return null;
        throw e;
      }
    });
    return { items: items.filter((x): x is ThreadSummary => x !== null), nextCursor: res.nextPageToken ?? null };
  }

  async getThread(threadId: string, opts: { allowRemoteImages: boolean }): Promise<ThreadDetail> {
    const t = await this.client.request<GmailThread>(`/threads/${enc(threadId)}`, { query: { format: "full" } });
    const messages = (t.messages ?? []).map((m) => toMessageView(m, opts));
    return { id: t.id, subject: messages[0]?.subject ?? "", messages };
  }

  async getReplySource(messageId: string): Promise<ReplySource> {
    const m = await this.client.request<GmailMessage>(`/messages/${enc(messageId)}`, { query: { format: "full" } });
    const h = m.payload?.headers;
    const view = toMessageView(m, { allowRemoteImages: false });
    return {
      messageId: m.id,
      threadId: m.threadId,
      rfc822MessageId: header(h, "Message-ID") ?? header(h, "Message-Id"),
      references: header(h, "References"),
      subject: header(h, "Subject") ?? "",
      from: header(h, "From"),
      replyTo: header(h, "Reply-To"),
      to: header(h, "To"),
      cc: header(h, "Cc"),
      date: internalDateIso(m),
      text: view.text,
    };
  }

  async setThreadRead(threadId: string, read: boolean): Promise<void> {
    await this.client.request(`/threads/${enc(threadId)}/modify`, {
      method: "POST",
      body: read ? { removeLabelIds: ["UNREAD"] } : { addLabelIds: ["UNREAD"] },
      retry: true, // ラベル変更は冪等
    });
  }

  async archiveThread(threadId: string): Promise<void> {
    await this.client.request(`/threads/${enc(threadId)}/modify`, {
      method: "POST",
      body: { removeLabelIds: ["INBOX"] },
      retry: true,
    });
  }

  // ---- 下書き ----

  async listDrafts(opts: { pageToken?: string; limit: number }): Promise<Page<DraftSummary>> {
    const res = await this.client.request<DraftsListResponse>("/drafts", {
      query: { maxResults: opts.limit, pageToken: opts.pageToken },
    });
    const items = await mapLimit(res.drafts ?? [], FETCH_CONCURRENCY, async (d) => {
      try {
        const draft = await this.client.request<GmailDraft>(`/drafts/${enc(d.id)}`, {
          query: { format: "metadata" },
        });
        const h = draft.message.payload?.headers;
        const summary: DraftSummary = {
          id: draft.id,
          threadId: draft.message.threadId ?? null,
          to: parseAddressList(header(h, "To")),
          subject: header(h, "Subject") ?? "",
          snippet: decodeHtmlEntities(draft.message.snippet ?? ""),
          updatedAt: internalDateIso(draft.message),
        };
        return summary;
      } catch (e) {
        if (e instanceof MailError && e.code === "NOT_FOUND") return null;
        throw e;
      }
    });
    return { items: items.filter((x): x is DraftSummary => x !== null), nextCursor: res.nextPageToken ?? null };
  }

  async getDraft(draftId: string): Promise<DraftDetail> {
    const d = await this.client.request<GmailDraft>(`/drafts/${enc(draftId)}`, { query: { format: "full" } });
    const h = d.message.payload?.headers;
    const { text } = collectParts(d.message.payload);
    const inReplyTo = header(h, "In-Reply-To");
    let replyToMessageId: string | null = null;
    if (inReplyTo && d.message.threadId) {
      replyToMessageId = await this.findMessageIdByRfc822(inReplyTo).catch(() => null);
    }
    return {
      id: d.id,
      threadId: d.message.threadId ?? null,
      to: splitHeaderList(header(h, "To")),
      cc: splitHeaderList(header(h, "Cc")),
      bcc: splitHeaderList(header(h, "Bcc")),
      subject: header(h, "Subject") ?? "",
      body: (text ?? "").replace(/\r\n/g, "\n"),
      replyToMessageId,
    };
  }

  async createDraft(msg: OutgoingMessage, threadId?: string) {
    const { raw } = buildMimeMessage(msg);
    const d = await this.client.request<GmailDraft>("/drafts", {
      method: "POST",
      body: { message: { raw: toBase64Url(raw), threadId } },
      retry: false,
    });
    return { draftId: d.id, messageId: d.message.id, threadId: d.message.threadId ?? null };
  }

  async updateDraft(draftId: string, msg: OutgoingMessage, threadId?: string) {
    const { raw } = buildMimeMessage(msg);
    const d = await this.client.request<GmailDraft>(`/drafts/${enc(draftId)}`, {
      method: "PUT",
      body: { id: draftId, message: { raw: toBase64Url(raw), threadId } },
      retry: true, // 同内容での上書きは冪等
    });
    return { draftId: d.id, messageId: d.message.id };
  }

  // ---- 送信（自動再試行しない） ----

  async sendMessage(msg: OutgoingMessage, threadId?: string) {
    const { raw } = buildMimeMessage(msg);
    const m = await this.client.request<GmailMessage>("/messages/send", {
      method: "POST",
      body: { raw: toBase64Url(raw), threadId },
      retry: false,
      timeoutMs: 30_000,
    });
    return { messageId: m.id, threadId: m.threadId };
  }

  async sendDraft(draftId: string) {
    const m = await this.client.request<GmailMessage>("/drafts/send", {
      method: "POST",
      body: { id: draftId },
      retry: false,
      timeoutMs: 30_000,
    });
    return { messageId: m.id, threadId: m.threadId };
  }

  async findSentByRfc822Id(rfc822MessageId: string) {
    const id = await this.findMessageIdByRfc822(rfc822MessageId, "in:sent ");
    if (!id) return null;
    const m = await this.client.request<GmailMessage>(`/messages/${enc(id)}`, { query: { format: "minimal" } });
    return { messageId: m.id, threadId: m.threadId };
  }

  private async findMessageIdByRfc822(rfc822: string, prefix = ""): Promise<string | null> {
    const bare = rfc822.trim().replace(/^<|>$/g, "");
    if (!/^[\x21-\x7e]+$/.test(bare)) return null;
    const res = await this.client.request<{ messages?: { id: string }[] }>("/messages", {
      query: { q: `${prefix}rfc822msgid:${bare}`, maxResults: 1, includeSpamTrash: false },
    });
    return res.messages?.[0]?.id ?? null;
  }

  // ---- 変更フィード ----

  async getProfile() {
    const p = await this.client.request<{ emailAddress: string; historyId: string }>("/profile");
    return { email: p.emailAddress.toLowerCase(), historyId: p.historyId };
  }

  async listAddedSince(cursor: string): Promise<{ messages: ChangedMessage[]; historyId: string }> {
    const found = new Map<string, ChangedMessage>();
    let pageToken: string | undefined;
    let latest = cursor;
    let pages = 0;
    do {
      let res: HistoryResponse;
      try {
        res = await this.client.request<HistoryResponse>("/history", {
          query: { startHistoryId: cursor, historyTypes: "messageAdded", labelId: "INBOX", pageToken, maxResults: 500 },
        });
      } catch (e) {
        // startHistoryId が古すぎると 404（仕様：cursor期限切れ→再同期）
        if (e instanceof MailError && e.code === "NOT_FOUND") throw new MailError("CURSOR_EXPIRED", undefined, { cause: e });
        throw e;
      }
      for (const h of res.history ?? []) {
        for (const added of h.messagesAdded ?? []) {
          const m = added.message;
          found.set(m.id, { messageId: m.id, threadId: m.threadId, labelIds: m.labelIds ?? [] });
        }
      }
      latest = res.historyId ?? latest;
      pageToken = res.nextPageToken;
      pages++;
    } while (pageToken && pages < 20);
    return { messages: [...found.values()].filter(isNotifiable), historyId: latest };
  }

  async listRecentInbox(since: Date, limit: number): Promise<ChangedMessage[]> {
    const after = Math.floor(since.getTime() / 1000);
    const res = await this.client.request<{ messages?: { id: string; threadId: string }[] }>("/messages", {
      query: { q: `in:inbox is:unread after:${after}`, maxResults: limit },
    });
    return (res.messages ?? []).map((m) => ({ messageId: m.id, threadId: m.threadId, labelIds: ["INBOX", "UNREAD"] }));
  }

  async getMessageMeta(messageId: string): Promise<MessageMeta> {
    const m = await this.client.request<GmailMessage>(`/messages/${enc(messageId)}`, {
      query: { format: "metadata", metadataHeaders: ["From", "Subject"] },
    });
    return {
      messageId: m.id,
      threadId: m.threadId,
      from: header(m.payload?.headers, "From"),
      subject: header(m.payload?.headers, "Subject") ?? "",
      internalDate: new Date(Number(m.internalDate ?? 0)),
      labelIds: m.labelIds ?? [],
    };
  }

  async watch(topicName: string) {
    const res = await this.client.request<{ historyId: string; expiration: string }>("/watch", {
      method: "POST",
      body: { topicName, labelIds: ["INBOX"], labelFilterBehavior: "INCLUDE" },
      retry: true,
    });
    return { historyId: res.historyId, expiresAt: new Date(Number(res.expiration)) };
  }

  async stopWatch() {
    await this.client.request("/stop", { method: "POST", retry: true });
  }
}

export function isNotifiable(m: ChangedMessage): boolean {
  return m.labelIds.includes("INBOX") && m.labelIds.includes("UNREAD") && !m.labelIds.some((l) => NON_NOTIFY_LABELS.has(l));
}

function enc(id: string): string {
  if (!/^[A-Za-z0-9_-]{1,128}$/.test(id)) throw new MailError("INVALID_INPUT", "IDの形式が不正です");
  return encodeURIComponent(id);
}

function splitHeaderList(value: string | null): string[] {
  return parseAddressList(value).map((a) => (a.name ? `${a.name} <${a.email}>` : a.email));
}

function toThreadSummary(t: GmailThread, listSnippet?: string): ThreadSummary {
  const messages = t.messages ?? [];
  const first = messages[0];
  const last = messages[messages.length - 1];
  const participants = uniqueAddresses(
    messages
      .map((m) => header(m.payload?.headers, "From"))
      .filter((v): v is string => !!v)
      .map((v) => parseAddress(v))
      .filter((a): a is NonNullable<typeof a> => a !== null),
  );
  return {
    id: t.id,
    subject: header(first?.payload?.headers, "Subject") ?? "",
    snippet: decodeHtmlEntities(last?.snippet ?? listSnippet ?? ""),
    participants,
    lastMessageAt: last ? internalDateIso(last) : new Date(0).toISOString(),
    unread: messages.some((m) => m.labelIds?.includes("UNREAD")),
    hasAttachments: messages.some((m) => (m.payload?.mimeType ?? "").toLowerCase() === "multipart/mixed"),
    messageCount: messages.length,
  };
}
