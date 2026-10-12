// Gmail API のメッセージ構造をドメイン型へ変換する。
import { parseAddress, parseAddressList } from "../../address";
import type { AttachmentInfo, MessageView } from "../../types";
import { htmlToText, sanitizeEmailHtml } from "../sanitize";

export interface GmailHeader {
  name: string;
  value: string;
}

export interface GmailPart {
  partId?: string;
  mimeType?: string;
  filename?: string;
  headers?: GmailHeader[];
  body?: { size?: number; data?: string; attachmentId?: string };
  parts?: GmailPart[];
}

export interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  historyId?: string;
  internalDate?: string;
  payload?: GmailPart;
}

export function header(headers: GmailHeader[] | undefined, name: string): string | null {
  const lower = name.toLowerCase();
  const h = headers?.find((x) => x.name.toLowerCase() === lower);
  return h ? decodeEncodedWords(h.value) : null;
}

/**
 * RFC 2047 encoded-word を復号する。Gmail API は通常デコード済みの値を返すが、
 * 一部のメールでは生のまま残るため防御的に処理する。
 */
export function decodeEncodedWords(value: string): string {
  if (!value.includes("=?")) return value;
  const joined = value.replace(/(\?=)\s+(=\?)/g, "$1$2");
  return joined.replace(/=\?([^?]+)\?([bBqQ])\?([^?]*)\?=/g, (whole, charset: string, enc: string, text: string) => {
    try {
      const bytes =
        enc.toUpperCase() === "B"
          ? Buffer.from(text, "base64")
          : Buffer.from(
              text.replace(/_/g, " ").replace(/=([0-9A-Fa-f]{2})/g, (_, h: string) => String.fromCharCode(parseInt(h, 16))),
              "latin1",
            );
      return decodeBytes(bytes, charset);
    } catch {
      return whole;
    }
  });
}

export function decodeBytes(bytes: Uint8Array, charset: string | null | undefined): string {
  const label = (charset ?? "utf-8").trim().replace(/^"|"$/g, "").toLowerCase();
  try {
    return new TextDecoder(label, { fatal: false }).decode(bytes);
  } catch {
    // 未知の文字コードは UTF-8 として扱う
    return new TextDecoder("utf-8").decode(bytes);
  }
}

function charsetOf(part: GmailPart): string | null {
  const ct = header(part.headers, "Content-Type");
  const m = ct ? /charset\s*=\s*"?([^";\s]+)"?/i.exec(ct) : null;
  return m?.[1] ?? null;
}

function decodePartBody(part: GmailPart): string | null {
  const data = part.body?.data;
  if (!data) return null;
  return decodeBytes(Buffer.from(data, "base64url"), charsetOf(part));
}

interface Collected {
  text: string | null;
  html: string | null;
  attachments: AttachmentInfo[];
}

function isAttachment(part: GmailPart): boolean {
  if (part.filename) return true;
  const disposition = header(part.headers, "Content-Disposition");
  return !!disposition && /^\s*attachment/i.test(disposition);
}

export function collectParts(root: GmailPart | undefined): Collected {
  const out: Collected = { text: null, html: null, attachments: [] };
  const walk = (part: GmailPart) => {
    const mime = (part.mimeType ?? "").toLowerCase();
    if (isAttachment(part)) {
      out.attachments.push({
        filename: part.filename || "(名前なし)",
        mimeType: part.mimeType ?? "application/octet-stream",
        size: part.body?.size ?? 0,
      });
      return;
    }
    if (mime === "text/plain" && out.text === null) out.text = decodePartBody(part);
    else if (mime === "text/html" && out.html === null) out.html = decodePartBody(part);
    part.parts?.forEach(walk);
  };
  if (root) walk(root);
  return out;
}

export function toMessageView(msg: GmailMessage, opts: { allowRemoteImages: boolean }): MessageView {
  const headers = msg.payload?.headers;
  const labels = msg.labelIds ?? [];
  const { text, html, attachments } = collectParts(msg.payload);
  const sanitized = html ? sanitizeEmailHtml(html, opts) : null;
  const fromHeader = header(headers, "From");
  return {
    id: msg.id,
    threadId: msg.threadId,
    from: fromHeader ? parseAddress(fromHeader) : null,
    to: parseAddressList(header(headers, "To")),
    cc: parseAddressList(header(headers, "Cc")),
    replyTo: parseAddressList(header(headers, "Reply-To")),
    subject: header(headers, "Subject") ?? "",
    date: internalDateIso(msg),
    unread: labels.includes("UNREAD"),
    snippet: decodeHtmlEntities(msg.snippet ?? ""),
    text: text ?? (html ? htmlToText(html) : null),
    html: sanitized?.html ?? null,
    remoteImagesBlocked: sanitized?.remoteImagesBlocked ?? false,
    attachments,
    isDraft: labels.includes("DRAFT"),
    isSent: labels.includes("SENT"),
  };
}

export function internalDateIso(msg: { internalDate?: string }): string {
  const ms = Number(msg.internalDate ?? 0);
  return new Date(Number.isFinite(ms) ? ms : 0).toISOString();
}

/** Gmail の snippet は HTML エンティティを含む */
export function decodeHtmlEntities(s: string): string {
  return s
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(Number(d)))
    .replace(/&quot;/g, '"')
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
