// Gmail REST API の振る舞いを模したテスト用 fetch。
// GmailProvider → MailService / SyncService を実際のHTTP形状で検証するために使う（本番では使わない）。
import { decodeEncodedWords } from "../server/gmail/parse";
import type { GmailMessage, GmailPart } from "../server/gmail/parse";

export interface FakeMessageInput {
  id?: string;
  threadId?: string;
  from: string;
  to?: string;
  cc?: string;
  subject: string;
  text?: string;
  html?: string;
  labelIds?: string[];
  messageIdHeader?: string;
  references?: string;
  inReplyTo?: string;
  date?: Date;
  attachments?: { filename: string; mimeType: string; size: number }[];
  /** text/plain の charset（ISO-2022-JP等の検証用） */
  charset?: string;
  textBytes?: Uint8Array;
}

interface StoredMessage {
  id: string;
  threadId: string;
  labelIds: string[];
  headers: { name: string; value: string }[];
  text?: string;
  textBytes?: Uint8Array;
  charset?: string;
  html?: string;
  attachments: { filename: string; mimeType: string; size: number }[];
  internalDate: number;
  bcc?: string;
}

interface Failure {
  match: RegExp;
  method?: string;
  status?: number;
  body?: unknown;
  /** fetch自体を失敗させる（通信断・タイムアウトの再現） */
  throwError?: "network" | "timeout";
  times: number;
}

export interface RecordedRequest {
  method: string;
  path: string;
  query: URLSearchParams;
  body: unknown;
  authorization: string | null;
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}${(++seq).toString(16).padStart(8, "0")}`;

export class FakeGmail {
  readonly email: string;
  readonly messages = new Map<string, StoredMessage>();
  readonly drafts = new Map<string, string>(); // draftId -> messageId
  readonly history: { id: number; added: string[] }[] = [];
  readonly requests: RecordedRequest[] = [];
  historyId = 1000;
  /** これより古い startHistoryId は 404（期限切れ）を返す */
  minHistoryId = 0;
  watchCalls = 0;
  validAccessTokens = new Set<string>(["access-1"]);
  refreshToken = "refresh-1";
  private failures: Failure[] = [];
  private tokenCounter = 1;
  revokedRefresh = false;

  constructor(email = "me@example.com") {
    this.email = email;
  }

  failNext(f: Omit<Failure, "times"> & { times?: number }) {
    this.failures.push({ times: 1, ...f });
  }

  addMessage(input: FakeMessageInput): StoredMessage {
    const id = input.id ?? nextId("m");
    const threadId = input.threadId ?? id;
    const headers = [
      { name: "From", value: input.from },
      { name: "To", value: input.to ?? this.email },
      ...(input.cc ? [{ name: "Cc", value: input.cc }] : []),
      { name: "Subject", value: input.subject },
      { name: "Message-ID", value: input.messageIdHeader ?? `<${id}@mail.example.com>` },
      ...(input.references ? [{ name: "References", value: input.references }] : []),
      ...(input.inReplyTo ? [{ name: "In-Reply-To", value: input.inReplyTo }] : []),
    ];
    const m: StoredMessage = {
      id,
      threadId,
      labelIds: input.labelIds ?? ["INBOX", "UNREAD"],
      headers,
      text: input.text,
      textBytes: input.textBytes,
      charset: input.charset,
      html: input.html,
      attachments: input.attachments ?? [],
      internalDate: (input.date ?? new Date()).getTime(),
    };
    this.messages.set(id, m);
    this.historyId += 1;
    this.history.push({ id: this.historyId, added: [id] });
    return m;
  }

  /** 新着メールの受信を再現する */
  deliver(input: FakeMessageInput) {
    return this.addMessage(input);
  }

  readonly fetch: typeof fetch = async (input, init) => {
    const url = new URL(typeof input === "string" ? input : input instanceof URL ? input.href : input.url);
    const method = (init?.method ?? "GET").toUpperCase();
    const rawBody = typeof init?.body === "string" ? init.body : null;
    const headers = new Headers(init?.headers);

    if (url.hostname === "oauth2.googleapis.com") return this.oauth(url, rawBody);

    const path = url.pathname.replace(/^\/gmail\/v1\/users\/me/, "");
    const body = rawBody ? JSON.parse(rawBody) : undefined;
    this.requests.push({ method, path, query: url.searchParams, body, authorization: headers.get("authorization") });

    const failure = this.failures.find((f) => f.match.test(path) && (!f.method || f.method === method));
    if (failure) {
      failure.times--;
      if (failure.times <= 0) this.failures = this.failures.filter((f) => f !== failure);
      if (failure.throwError === "timeout") throw new DOMException("timeout", "TimeoutError");
      if (failure.throwError === "network") throw new TypeError("fetch failed");
      return json(failure.status ?? 500, failure.body ?? { error: { code: failure.status ?? 500, status: "INTERNAL" } });
    }

    const token = headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
    if (!this.validAccessTokens.has(token)) return json(401, { error: { code: 401, status: "UNAUTHENTICATED" } });

    return this.route(method, path, url.searchParams, body);
  };

  private oauth(url: URL, rawBody: string | null): Response {
    const form = new URLSearchParams(rawBody ?? "");
    if (url.pathname === "/revoke") return new Response("", { status: 200 });
    if (form.get("grant_type") === "refresh_token") {
      if (this.revokedRefresh || form.get("refresh_token") !== this.refreshToken) {
        return json(400, { error: "invalid_grant" });
      }
      const token = `access-${++this.tokenCounter}`;
      this.validAccessTokens.add(token);
      return json(200, { access_token: token, expires_in: 3599, scope: "https://www.googleapis.com/auth/gmail.modify" });
    }
    return json(400, { error: "unsupported_grant_type" });
  }

  private route(method: string, path: string, q: URLSearchParams, body: Record<string, unknown> | undefined): Response {
    let m: RegExpExecArray | null;
    if (method === "GET" && path === "/profile") {
      return json(200, { emailAddress: this.email, historyId: String(this.historyId) });
    }
    if (method === "GET" && path === "/threads") return this.listThreads(q);
    if ((m = /^\/threads\/([^/]+)$/.exec(path)) && method === "GET") return this.getThread(m[1]!, q.get("format") ?? "full");
    if ((m = /^\/threads\/([^/]+)\/modify$/.exec(path)) && method === "POST") {
      const list = this.threadMessages(m[1]!);
      if (!list.length) return notFound();
      for (const msg of list) this.modify(msg, body as { addLabelIds?: string[]; removeLabelIds?: string[] });
      return json(200, { id: m[1] });
    }
    if (method === "GET" && path === "/messages") return this.listMessages(q);
    if ((m = /^\/messages\/([^/]+)$/.exec(path)) && method === "GET") {
      const msg = this.messages.get(m[1]!);
      return msg ? json(200, this.toApi(msg, q.get("format") ?? "full")) : notFound();
    }
    if (method === "POST" && path === "/messages/send") {
      const b = body as { raw: string; threadId?: string };
      const msg = this.fromRaw(b.raw, b.threadId, ["SENT"]);
      return json(200, { id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds });
    }
    if (method === "GET" && path === "/drafts") {
      const drafts = [...this.drafts.entries()].map(([id, mid]) => ({
        id,
        message: { id: mid, threadId: this.messages.get(mid)?.threadId },
      }));
      return json(200, { drafts });
    }
    if (method === "POST" && path === "/drafts") {
      const b = body as { message: { raw: string; threadId?: string } };
      const msg = this.fromRaw(b.message.raw, b.message.threadId, ["DRAFT"]);
      const id = nextId("r");
      this.drafts.set(id, msg.id);
      return json(200, { id, message: { id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds } });
    }
    if (method === "POST" && path === "/drafts/send") {
      const id = (body as { id: string }).id;
      const mid = this.drafts.get(id);
      const msg = mid ? this.messages.get(mid) : undefined;
      if (!msg) return notFound();
      this.drafts.delete(id);
      msg.labelIds = ["SENT"];
      return json(200, { id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds });
    }
    if ((m = /^\/drafts\/([^/]+)$/.exec(path))) {
      const draftId = m[1]!;
      const mid = this.drafts.get(draftId);
      if (!mid) return notFound();
      if (method === "GET") {
        return json(200, { id: draftId, message: this.toApi(this.messages.get(mid)!, q.get("format") ?? "full") });
      }
      if (method === "PUT") {
        const b = body as { message: { raw: string; threadId?: string } };
        this.messages.delete(mid);
        const msg = this.fromRaw(b.message.raw, b.message.threadId, ["DRAFT"]);
        this.drafts.set(draftId, msg.id);
        return json(200, { id: draftId, message: { id: msg.id, threadId: msg.threadId, labelIds: msg.labelIds } });
      }
    }
    if (method === "GET" && path === "/history") {
      const start = Number(q.get("startHistoryId"));
      if (start < this.minHistoryId) return notFound();
      const labelId = q.get("labelId");
      const history = this.history
        .filter((h) => h.id > start)
        .map((h) => ({
          id: String(h.id),
          messagesAdded: h.added
            .map((id) => this.messages.get(id))
            .filter((x): x is StoredMessage => !!x && (!labelId || x.labelIds.includes(labelId)))
            .map((x) => ({ message: { id: x.id, threadId: x.threadId, labelIds: [...x.labelIds] } })),
        }));
      return json(200, { history, historyId: String(this.historyId) });
    }
    if (method === "POST" && path === "/watch") {
      this.watchCalls++;
      return json(200, { historyId: String(this.historyId), expiration: String(Date.now() + 7 * 86400_000) });
    }
    if (method === "POST" && path === "/stop") return new Response(null, { status: 204 });
    return notFound();
  }

  private threadMessages(threadId: string) {
    return [...this.messages.values()].filter((m) => m.threadId === threadId).sort((a, b) => a.internalDate - b.internalDate);
  }

  private modify(msg: StoredMessage, b: { addLabelIds?: string[]; removeLabelIds?: string[] }) {
    const set = new Set(msg.labelIds);
    b.addLabelIds?.forEach((l) => set.add(l));
    b.removeLabelIds?.forEach((l) => set.delete(l));
    msg.labelIds = [...set];
  }

  private matches(msg: StoredMessage, query: string | null): boolean {
    if (!query) return !msg.labelIds.includes("DRAFT");
    return query.split(/\s+/).every((term) => {
      if (term === "in:inbox") return msg.labelIds.includes("INBOX");
      if (term === "in:sent") return msg.labelIds.includes("SENT");
      if (term === "is:unread") return msg.labelIds.includes("UNREAD");
      if (term.startsWith("after:")) return msg.internalDate / 1000 > Number(term.slice(6));
      if (term.startsWith("rfc822msgid:")) {
        const id = term.slice("rfc822msgid:".length);
        return msg.headers.some((h) => h.name.toLowerCase() === "message-id" && h.value.replace(/^<|>$/g, "") === id);
      }
      if (term.startsWith("from:")) return this.header(msg, "From").toLowerCase().includes(term.slice(5).toLowerCase());
      const hay = `${this.header(msg, "Subject")} ${msg.text ?? ""} ${this.header(msg, "From")}`.toLowerCase();
      return hay.includes(term.toLowerCase());
    });
  }

  private header(msg: StoredMessage, name: string) {
    return msg.headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value ?? "";
  }

  private listThreads(q: URLSearchParams): Response {
    const labelIds = q.getAll("labelIds");
    const query = q.get("q");
    const max = Number(q.get("maxResults") ?? 100);
    const start = Number(q.get("pageToken") ?? 0);
    const byThread = new Map<string, StoredMessage[]>();
    for (const m of this.messages.values()) {
      if (labelIds.length && !labelIds.every((l) => m.labelIds.includes(l))) continue;
      if (!this.matches(m, query)) continue;
      byThread.set(m.threadId, [...(byThread.get(m.threadId) ?? []), m]);
    }
    const sorted = [...byThread.entries()].sort(
      (a, b) => Math.max(...b[1].map((m) => m.internalDate)) - Math.max(...a[1].map((m) => m.internalDate)),
    );
    const page = sorted.slice(start, start + max);
    return json(200, {
      threads: page.map(([id, ms]) => ({ id, snippet: (ms[ms.length - 1]!.text ?? "").slice(0, 100) })),
      nextPageToken: start + max < sorted.length ? String(start + max) : undefined,
    });
  }

  private listMessages(q: URLSearchParams): Response {
    const query = q.get("q");
    const max = Number(q.get("maxResults") ?? 100);
    const list = [...this.messages.values()]
      .filter((m) => this.matches(m, query) || (query?.includes("rfc822msgid:") && this.matches(m, query)))
      .sort((a, b) => b.internalDate - a.internalDate)
      .slice(0, max);
    return json(200, { messages: list.map((m) => ({ id: m.id, threadId: m.threadId })), resultSizeEstimate: list.length });
  }

  private getThread(id: string, format: string): Response {
    const list = this.threadMessages(id);
    if (!list.length) return notFound();
    return json(200, { id, messages: list.map((m) => this.toApi(m, format)) });
  }

  toApi(m: StoredMessage, format: string): GmailMessage {
    const base: GmailMessage = {
      id: m.id,
      threadId: m.threadId,
      labelIds: [...m.labelIds],
      snippet: (m.text ?? m.html ?? "").slice(0, 100),
      internalDate: String(m.internalDate),
      historyId: String(this.historyId),
    };
    if (format === "minimal") return base;
    const mixed = m.attachments.length > 0;
    if (format === "metadata") {
      return { ...base, payload: { mimeType: mixed ? "multipart/mixed" : "multipart/alternative", headers: m.headers } };
    }
    const parts: GmailPart[] = [];
    if (m.text !== undefined || m.textBytes) {
      const bytes = m.textBytes ?? Buffer.from(m.text ?? "", "utf8");
      parts.push({
        mimeType: "text/plain",
        headers: [{ name: "Content-Type", value: `text/plain; charset="${m.charset ?? "UTF-8"}"` }],
        body: { size: bytes.length, data: Buffer.from(bytes).toString("base64url") },
      });
    }
    if (m.html !== undefined) {
      parts.push({
        mimeType: "text/html",
        headers: [{ name: "Content-Type", value: 'text/html; charset="UTF-8"' }],
        body: { size: m.html.length, data: Buffer.from(m.html, "utf8").toString("base64url") },
      });
    }
    const alt: GmailPart = { mimeType: "multipart/alternative", parts };
    const payload: GmailPart = mixed
      ? {
          mimeType: "multipart/mixed",
          headers: m.headers,
          parts: [
            alt,
            ...m.attachments.map((a) => ({
              mimeType: a.mimeType,
              filename: a.filename,
              body: { size: a.size, attachmentId: nextId("att") },
            })),
          ],
        }
      : { ...alt, headers: m.headers };
    return { ...base, payload };
  }

  /** 送信・下書きの raw MIME を解析して保存する（ヘッダーは Gmail と同様デコード済みで返す） */
  private fromRaw(raw: string, threadId: string | undefined, labels: string[]): StoredMessage {
    const mime = Buffer.from(raw, "base64url").toString("utf8");
    const parsed = parseRawMime(mime);
    const id = nextId("m");
    const headers = parsed.headers.filter((h) => h.name.toLowerCase() !== "bcc");
    const msg: StoredMessage = {
      id,
      threadId: threadId ?? id,
      labelIds: labels,
      headers,
      text: parsed.body,
      attachments: [],
      internalDate: Date.now(),
      bcc: parsed.headers.find((h) => h.name.toLowerCase() === "bcc")?.value,
    };
    // 下書きは Bcc を保持する
    if (labels.includes("DRAFT") && msg.bcc) msg.headers.push({ name: "Bcc", value: msg.bcc });
    this.messages.set(id, msg);
    return msg;
  }

  lastRawMime(): string | null {
    const sends = this.requests.filter((r) => r.path === "/messages/send" || r.path === "/drafts");
    const last = sends[sends.length - 1]?.body as { raw?: string; message?: { raw: string } } | undefined;
    const raw = last?.raw ?? last?.message?.raw;
    return raw ? Buffer.from(raw, "base64url").toString("utf8") : null;
  }
}

export function parseRawMime(mime: string): { headers: { name: string; value: string }[]; body: string; rawHeaders: string } {
  const idx = mime.indexOf("\r\n\r\n");
  const head = mime.slice(0, idx);
  const unfolded = head.replace(/\r\n[ \t]/g, " ");
  const headers = unfolded.split("\r\n").map((line) => {
    const i = line.indexOf(":");
    return { name: line.slice(0, i), value: decodeEncodedWords(line.slice(i + 1).trim()) };
  });
  const bodyEncoded = mime.slice(idx + 4);
  const cte = headers.find((h) => h.name.toLowerCase() === "content-transfer-encoding")?.value;
  const body = cte === "base64" ? Buffer.from(bodyEncoded.replace(/\r\n/g, ""), "base64").toString("utf8") : bodyEncoded;
  return { headers, body, rawHeaders: head };
}

function json(status: number, body: unknown): Response {
  return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
}

function notFound(): Response {
  return json(404, { error: { code: 404, status: "NOT_FOUND", message: "Requested entity was not found." } });
}
