// RFC 5322 / RFC 2045 / RFC 2047 準拠の送信用MIME生成。
// 日本語（UTF-8）の件名・表示名・本文を安全にエンコードし、Gmail APIが要求するbase64urlへ変換する。
import { randomUUID } from "node:crypto";
import { parseAddress } from "../address";
import { MailError } from "../errors";

const CRLF = "\r\n";

export interface OutgoingMessage {
  from?: string;
  to: string[];
  cc: string[];
  bcc: string[];
  subject: string;
  body: string;
  inReplyTo?: string | null;
  references?: string | null;
  /** RFC 822 Message-ID（山括弧つき）。未指定なら生成する */
  messageId?: string;
  date?: Date;
}

function assertNoNewline(value: string, field: string) {
  if (/[\r\n]/.test(value)) {
    throw new MailError("INVALID_INPUT", `${field}に改行は使えません`);
  }
}

const ASCII_PRINTABLE = /^[\x20-\x7e]*$/;

/**
 * RFC 2047 encoded-word (B encoding, UTF-8)。
 * 1語75文字以内に収めるため、UTF-8のコードポイント境界で分割する。
 */
export function encodeWord(text: string): string {
  if (ASCII_PRINTABLE.test(text)) return text;
  const maxBytes = 45; // base64で60文字 + "=?UTF-8?B?" "?=" = 72文字
  const words: string[] = [];
  let chunk = "";
  let chunkBytes = 0;
  for (const ch of text) {
    const bytes = Buffer.byteLength(ch, "utf8");
    if (chunkBytes + bytes > maxBytes && chunk) {
      words.push(chunk);
      chunk = "";
      chunkBytes = 0;
    }
    chunk += ch;
    chunkBytes += bytes;
  }
  if (chunk) words.push(chunk);
  return words.map((w) => `=?UTF-8?B?${Buffer.from(w, "utf8").toString("base64")}?=`).join(`${CRLF} `);
}

function formatMailbox(raw: string): string {
  assertNoNewline(raw, "宛先");
  const addr = parseAddress(raw);
  if (!addr) throw new MailError("INVALID_INPUT", "メールアドレスの形式が正しくありません");
  if (!/^[\x21-\x7e]+$/.test(addr.email)) {
    throw new MailError("INVALID_INPUT", "メールアドレスに使えない文字が含まれています");
  }
  if (!addr.name) return addr.email;
  if (ASCII_PRINTABLE.test(addr.name)) {
    return `"${addr.name.replace(/(["\\])/g, "\\$1")}" <${addr.email}>`;
  }
  return `${encodeWord(addr.name)} <${addr.email}>`;
}

function addressHeader(name: string, list: string[]): string | null {
  if (list.length === 0) return null;
  return `${name}: ${list.map(formatMailbox).join(`,${CRLF} `)}`;
}

/** base64を76文字ごとに折り返す（RFC 2045） */
function wrapBase64(b64: string): string {
  return b64.replace(/.{1,76}/g, (m) => m + CRLF).replace(/\r\n$/, "");
}

export function generateMessageId(domain = "synedge.local"): string {
  return `<synedge-${randomUUID()}@${domain}>`;
}

export function buildMimeMessage(msg: OutgoingMessage): { raw: string; messageId: string } {
  assertNoNewline(msg.subject, "件名");
  const messageId = msg.messageId ?? generateMessageId();
  assertNoNewline(messageId, "Message-ID");
  const headers: string[] = [];
  if (msg.from) headers.push(`From: ${formatMailbox(msg.from)}`);
  for (const h of [addressHeader("To", msg.to), addressHeader("Cc", msg.cc), addressHeader("Bcc", msg.bcc)]) {
    if (h) headers.push(h);
  }
  headers.push(`Subject: ${encodeWord(msg.subject)}`);
  headers.push(`Date: ${(msg.date ?? new Date()).toUTCString().replace("GMT", "+0000")}`);
  headers.push(`Message-ID: ${messageId}`);
  if (msg.inReplyTo) {
    assertNoNewline(msg.inReplyTo, "In-Reply-To");
    headers.push(`In-Reply-To: ${msg.inReplyTo}`);
  }
  if (msg.references) {
    assertNoNewline(msg.references, "References");
    headers.push(`References: ${msg.references}`);
  }
  headers.push("MIME-Version: 1.0");
  headers.push('Content-Type: text/plain; charset="UTF-8"');
  headers.push("Content-Transfer-Encoding: base64");

  const normalizedBody = msg.body.replace(/\r\n?|\n/g, CRLF);
  const body = wrapBase64(Buffer.from(normalizedBody, "utf8").toString("base64"));
  return { raw: headers.join(CRLF) + CRLF + CRLF + body + CRLF, messageId };
}

export function toBase64Url(raw: string): string {
  return Buffer.from(raw, "utf8").toString("base64url");
}

/** 返信用の References を組み立てる（RFC 5322 3.6.4） */
export function buildReferences(parentReferences: string | null, parentMessageId: string | null): string | null {
  const ids = [...(parentReferences ?? "").split(/\s+/), parentMessageId ?? ""].map((s) => s.trim()).filter(Boolean);
  if (ids.length === 0) return null;
  // ヘッダー肥大化を避け、先頭と直近を残す
  const unique = [...new Set(ids)];
  const trimmed = unique.length > 20 ? [unique[0]!, ...unique.slice(-19)] : unique;
  return trimmed.join(" ");
}

export function replySubject(subject: string): string {
  return /^\s*(re|ｒｅ|返信)\s*[:：]/i.test(subject) ? subject : `Re: ${subject}`;
}
