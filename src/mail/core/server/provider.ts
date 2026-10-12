// メールプロバイダーの抽象（仕様4章）。Gmail以外を追加するときはこのインターフェースを実装する。
// 対応しない機能は capabilities で示し、呼ばれたら UNSUPPORTED を投げる（黙って失敗させない）。
import type {
  DraftDetail,
  DraftSummary,
  Page,
  ProviderCapabilities,
  ProviderId,
  ThreadDetail,
  ThreadSummary,
} from "../types";
import type { OutgoingMessage } from "./mime";
import type { AccountRecord } from "./ports";

export interface ReplySource {
  messageId: string;
  threadId: string;
  rfc822MessageId: string | null;
  references: string | null;
  subject: string;
  from: string | null;
  replyTo: string | null;
  to: string | null;
  cc: string | null;
  date: string;
  text: string | null;
}

export interface MailProvider {
  readonly id: ProviderId;
  readonly capabilities: ProviderCapabilities;

  listThreads(opts: { query?: string; inboxOnly: boolean; pageToken?: string; limit: number }): Promise<Page<ThreadSummary>>;
  getThread(threadId: string, opts: { allowRemoteImages: boolean }): Promise<ThreadDetail>;
  getReplySource(messageId: string): Promise<ReplySource>;
  setThreadRead(threadId: string, read: boolean): Promise<void>;
  archiveThread(threadId: string): Promise<void>;

  listDrafts(opts: { pageToken?: string; limit: number }): Promise<Page<DraftSummary>>;
  getDraft(draftId: string): Promise<DraftDetail>;
  createDraft(msg: OutgoingMessage, threadId?: string): Promise<{ draftId: string; messageId: string; threadId: string | null }>;
  updateDraft(draftId: string, msg: OutgoingMessage, threadId?: string): Promise<{ draftId: string; messageId: string }>;

  sendMessage(msg: OutgoingMessage, threadId?: string): Promise<{ messageId: string; threadId: string }>;
  sendDraft(draftId: string): Promise<{ messageId: string; threadId: string }>;
  /** 送信状態不明時の照合。Message-ID ヘッダーで送信済みを探す */
  findSentByRfc822Id(rfc822MessageId: string): Promise<{ messageId: string; threadId: string } | null>;
}

export interface ChangedMessage {
  messageId: string;
  threadId: string;
  labelIds: string[];
}

export interface MessageMeta {
  messageId: string;
  threadId: string;
  from: string | null;
  subject: string;
  internalDate: Date;
  labelIds: string[];
}

/** 新着検知のための変更フィード（Gmail history / watch） */
export interface MailboxChangeFeed {
  getProfile(): Promise<{ email: string; historyId: string }>;
  /** cursor 以降に受信トレイへ追加されたメッセージ。cursor が古すぎれば CURSOR_EXPIRED */
  listAddedSince(cursor: string): Promise<{ messages: ChangedMessage[]; historyId: string }>;
  /** 再同期用：指定時刻以降の受信トレイ未読 */
  listRecentInbox(since: Date, limit: number): Promise<ChangedMessage[]>;
  getMessageMeta(messageId: string): Promise<MessageMeta>;
  watch(topicName: string): Promise<{ historyId: string; expiresAt: Date }>;
  stopWatch(): Promise<void>;
}

export type ProviderFactory = (account: AccountRecord) => MailProvider & MailboxChangeFeed;
