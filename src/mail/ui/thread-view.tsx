import { displayName, splitQuotedText, type Address, type MessageView, type ThreadDetail } from "@/mail/core";
import { useCallback, useEffect, useRef, useState } from "react";
import { cx, formatBytes, formatFullDate } from "./format";
import { IconArchive, IconBack, IconMail, IconMailOpen, IconPaperclip, IconReply, IconReplyAll } from "./icons";
import { Banner, IconButton } from "./primitives";

export type ReplyMode = "reply" | "replyAll";

export interface ThreadViewProps {
  thread: ThreadDetail;
  onBack?: () => void;
  onReply: (messageId: string, mode: ReplyMode) => void;
  onToggleRead: (read: boolean) => void;
  onArchive: () => void;
  onShowImages: () => void;
  busy?: "read" | "archive" | null;
  remoteImagesAllowed: boolean;
}

export function ThreadView(p: ThreadViewProps) {
  const last = p.thread.messages[p.thread.messages.length - 1];
  const unread = p.thread.messages.some((m) => m.unread);
  const anyBlocked = p.thread.messages.some((m) => m.remoteImagesBlocked);
  const lastReplyable = [...p.thread.messages].reverse().find((m) => !m.isDraft);

  return (
    <article className="flex h-full min-h-0 flex-col" aria-label="スレッド">
      <header className="flex items-center gap-1 border-b border-border px-2 py-1">
        {p.onBack && (
          <IconButton label="一覧に戻る" onClick={p.onBack} className="lg:hidden">
            <IconBack />
          </IconButton>
        )}
        <div className="flex-1" />
        <IconButton label={unread ? "既読にする" : "未読にする"} onClick={() => p.onToggleRead(unread)} disabled={!!p.busy}>
          {unread ? <IconMailOpen /> : <IconMail />}
        </IconButton>
        <IconButton label="アーカイブ" onClick={p.onArchive} disabled={!!p.busy}>
          <IconArchive />
        </IconButton>
      </header>
      {anyBlocked && !p.remoteImagesAllowed && (
        <Banner kind="info" action={{ label: "画像を表示", onClick: p.onShowImages }}>
          プライバシー保護のため外部画像を読み込んでいません。
        </Banner>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto">
        <h1 className="px-4 pt-4 pb-2 text-lg font-semibold break-words text-text">{p.thread.subject || "(件名なし)"}</h1>
        <ol className="flex flex-col gap-3 px-2 pb-28 lg:px-4">
          {p.thread.messages.map((m) => (
            <li key={m.id}>
              <MessageCard
                message={m}
                defaultExpanded={m.id === last?.id || m.unread}
                remoteImagesAllowed={p.remoteImagesAllowed}
              />
            </li>
          ))}
        </ol>
      </div>
      {lastReplyable && (
        <footer className="sticky bottom-0 flex gap-2 border-t border-border bg-surface p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => p.onReply(lastReplyable.id, "reply")}
            className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-md bg-surface-2 text-sm font-medium text-text hover:bg-border/60"
          >
            <IconReply size={18} /> 返信
          </button>
          <button
            type="button"
            onClick={() => p.onReply(lastReplyable.id, "replyAll")}
            className="flex min-h-touch flex-1 items-center justify-center gap-2 rounded-md bg-surface-2 text-sm font-medium text-text hover:bg-border/60"
          >
            <IconReplyAll size={18} /> 全員に返信
          </button>
        </footer>
      )}
    </article>
  );
}

function addressLine(list: Address[]): string {
  return list.map((a) => (a.name ? `${a.name} <${a.email}>` : a.email)).join(", ");
}

export function MessageCard({
  message,
  defaultExpanded,
  remoteImagesAllowed,
}: {
  message: MessageView;
  defaultExpanded: boolean;
  remoteImagesAllowed: boolean;
}) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  return (
    <section
      className={cx("rounded-md border border-border bg-surface", message.unread && "border-l-4 border-l-unread")}
      aria-label={`${displayName(message.from)} からのメッセージ`}
    >
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        aria-expanded={expanded}
        className="flex w-full items-start gap-3 px-4 py-3 text-left focus-visible:outline-2 focus-visible:outline-accent"
      >
        <span className="flex min-w-0 flex-1 flex-col">
          <span className="flex items-baseline gap-2">
            <span className="truncate text-sm font-semibold text-text">{displayName(message.from)}</span>
            {message.isDraft && <span className="text-xs font-semibold text-danger">下書き</span>}
          </span>
          {expanded ? (
            <span className="truncate text-xs text-muted">
              宛先: {addressLine(message.to) || "(なし)"}
              {message.cc.length > 0 && ` / Cc: ${addressLine(message.cc)}`}
            </span>
          ) : (
            <span className="truncate text-xs text-muted">{message.snippet}</span>
          )}
        </span>
        <time dateTime={message.date} className="shrink-0 text-xs text-muted">
          {formatFullDate(message.date)}
        </time>
      </button>
      {expanded && (
        <div className="border-t border-border px-4 py-3">
          {message.html ? (
            <HtmlBody html={message.html} allowRemoteImages={remoteImagesAllowed} />
          ) : (
            <TextBody text={message.text ?? ""} />
          )}
          {message.attachments.length > 0 && (
            <ul className="mt-3 flex flex-wrap gap-2" aria-label="添付ファイル">
              {message.attachments.map((a, i) => (
                <li key={i} className="flex items-center gap-1 rounded-sm bg-surface-2 px-2 py-1 text-xs text-muted">
                  <IconPaperclip size={12} />
                  <span className="max-w-48 truncate">{a.filename}</span>
                  <span>({formatBytes(a.size)})</span>
                </li>
              ))}
              <li className="w-full text-xs text-muted">添付ファイルの表示・保存は Gmail で行ってください（MVP未対応）。</li>
            </ul>
          )}
        </div>
      )}
    </section>
  );
}

/** プレーンテキスト本文。引用部分は折りたたむ */
export function TextBody({ text }: { text: string }) {
  const segments = splitQuotedText(text);
  if (segments.length === 0) return <p className="text-sm text-muted">(本文なし)</p>;
  return (
    <div className="flex flex-col gap-2 text-sm leading-relaxed text-text">
      {segments.map((s, i) =>
        s.kind === "text" ? (
          <p key={i} className="whitespace-pre-wrap break-words">
            {s.content}
          </p>
        ) : (
          <details key={i} className="rounded-sm border-l-2 border-border pl-3 text-muted">
            <summary className="cursor-pointer text-xs select-none">引用を表示</summary>
            <p className="mt-1 whitespace-pre-wrap break-words">{s.content}</p>
          </details>
        ),
      )}
    </div>
  );
}

/**
 * サニタイズ済みHTMLを sandbox iframe で表示する。
 * allow-scripts を付けないためスクリプトは実行されない。CSP で外部読み込みも制限する。
 */
export function HtmlBody({ html, allowRemoteImages }: { html: string; allowRemoteImages: boolean }) {
  const ref = useRef<HTMLIFrameElement>(null);
  const [height, setHeight] = useState(120);
  const imgSrc = allowRemoteImages ? "data: https: http:" : "data:";
  const doc = `<!doctype html><html><head><meta charset="utf-8">
<meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${imgSrc}; style-src 'unsafe-inline'; font-src data:;">
<meta name="viewport" content="width=device-width,initial-scale=1"><base target="_blank">
<style>
:root{color-scheme:light dark}
body{margin:0;font:14px/1.6 -apple-system,"Hiragino Sans","Noto Sans JP",sans-serif;word-break:break-word;overflow-wrap:anywhere}
img{max-width:100%;height:auto}table{max-width:100%!important}
blockquote,.gmail_quote{margin:0 0 0 .5em;padding-left:.75em;border-left:2px solid #c7ccd3;color:#636b75}
img[data-blocked-src]{display:inline-block;min-width:16px;min-height:16px;background:#e2e5ea}
</style></head><body>${html}</body></html>`;

  const measure = useCallback(() => {
    const d = ref.current?.contentDocument;
    if (d?.documentElement) setHeight(Math.max(60, d.documentElement.scrollHeight + 4));
  }, []);

  useEffect(() => {
    const frame = ref.current;
    const d = frame?.contentDocument;
    if (!d?.body || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(measure);
    ro.observe(d.body);
    return () => ro.disconnect();
  }, [doc, measure]);

  return (
    <iframe
      ref={ref}
      title="メール本文"
      srcDoc={doc}
      sandbox="allow-same-origin allow-popups allow-popups-to-escape-sandbox"
      referrerPolicy="no-referrer"
      onLoad={measure}
      style={{ height }}
      className="w-full border-0 bg-white"
    />
  );
}
