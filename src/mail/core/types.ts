// クライアント・サーバー共通のメールドメイン型。
// UI・Web API・MCPはこの型でやり取りし、Gmail固有の構造を外へ漏らさない。

export type ProviderId = "gmail";

export interface Address {
  name?: string;
  email: string;
}

export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export interface ThreadSummary {
  id: string;
  subject: string;
  snippet: string;
  participants: Address[];
  lastMessageAt: string;
  unread: boolean;
  /** Gmail metadata の multipart/mixed 判定による推定値 */
  hasAttachments: boolean;
  messageCount: number;
}

export interface AttachmentInfo {
  filename: string;
  mimeType: string;
  size: number;
}

export interface MessageView {
  id: string;
  threadId: string;
  from: Address | null;
  to: Address[];
  cc: Address[];
  replyTo: Address[];
  subject: string;
  date: string;
  unread: boolean;
  snippet: string;
  /** text/plain 本文（なければHTMLから生成したテキスト） */
  text: string | null;
  /** サニタイズ済みHTML。表示時はさらにサンドボックスiframeに入れる */
  html: string | null;
  /** リモート画像を含み、かつ今回ブロックしたか */
  remoteImagesBlocked: boolean;
  attachments: AttachmentInfo[];
  isDraft: boolean;
  isSent: boolean;
}

export interface ThreadDetail {
  id: string;
  subject: string;
  messages: MessageView[];
}

export interface DraftSummary {
  id: string;
  threadId: string | null;
  to: Address[];
  subject: string;
  snippet: string;
  updatedAt: string;
}

export interface DraftDetail {
  id: string;
  threadId: string | null;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  replyToMessageId: string | null;
}

export type SendStatus = "pending" | "sent" | "failed" | "unknown";

export interface SendResult {
  status: SendStatus;
  messageId: string | null;
  threadId: string | null;
  /** 送信状態不明の場合に送信済みフォルダで照合するためのID */
  rfc822MessageId: string | null;
}

export interface ProviderCapabilities {
  search: boolean;
  drafts: boolean;
  archive: boolean;
  pushNotifications: boolean;
}

export interface UserSettings {
  notificationsEnabled: boolean;
  notificationPreview: boolean;
}

export type AccountStatus = "active" | "reauth_required";

export interface AccountInfo {
  id: string;
  provider: ProviderId;
  email: string;
  status: AccountStatus;
  watchExpiresAt: string | null;
  watchLastError: string | null;
  lastSyncedAt: string | null;
}
