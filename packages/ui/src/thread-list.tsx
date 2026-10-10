import { displayName, type DraftSummary, type ThreadSummary } from "@synedge/mail-core";
import { useEffect, useRef } from "react";
import { cx, formatListDate } from "./format";
import { IconPaperclip } from "./icons";
import { Button, EmptyState, ErrorState, ListSkeleton } from "./primitives";

export interface ThreadListItemProps {
  thread: ThreadSummary;
  selected: boolean;
  onSelect: (id: string) => void;
}

export function ThreadListItem({ thread, selected, onSelect }: ThreadListItemProps) {
  const ref = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    if (selected) ref.current?.scrollIntoView?.({ block: "nearest" });
  }, [selected]);
  const senders = thread.participants.map((p) => displayName(p)).join(", ") || "(不明な送信者)";
  return (
    <li>
      <button
        ref={ref}
        type="button"
        onClick={() => onSelect(thread.id)}
        aria-current={selected ? "true" : undefined}
        data-unread={thread.unread || undefined}
        className={cx(
          "flex w-full flex-col gap-0.5 px-4 py-3 text-left focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-accent",
          selected ? "bg-selected" : "hover:bg-surface-2",
        )}
      >
        <span className="flex items-center gap-2">
          {thread.unread && <span className="size-2 shrink-0 rounded-full bg-unread" aria-label="未読" />}
          <span className={cx("min-w-0 flex-1 truncate text-sm", thread.unread ? "font-bold text-text" : "text-text")}>
            {senders}
            {thread.messageCount > 1 && <span className="ml-1 text-xs font-normal text-muted">{thread.messageCount}</span>}
          </span>
          {thread.hasAttachments && <IconPaperclip size={14} aria-label="添付あり" className="shrink-0 text-muted" />}
          <time dateTime={thread.lastMessageAt} className="shrink-0 text-xs text-muted">
            {formatListDate(thread.lastMessageAt)}
          </time>
        </span>
        <span className={cx("truncate text-sm", thread.unread ? "font-semibold text-text" : "text-text")}>
          {thread.subject || "(件名なし)"}
        </span>
        <span className="line-clamp-2 text-xs text-muted">{thread.snippet}</span>
      </button>
    </li>
  );
}

export interface ThreadListProps {
  threads: ThreadSummary[];
  selectedId: string | null;
  onSelect: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
  hasMore: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  emptyTitle: string;
  emptyDescription?: string;
  label: string;
}

export function ThreadList(p: ThreadListProps) {
  if (p.loading && p.threads.length === 0) return <ListSkeleton />;
  if (p.error && p.threads.length === 0) return <ErrorState message={p.error} onRetry={p.onRetry} />;
  if (p.threads.length === 0) return <EmptyState title={p.emptyTitle} description={p.emptyDescription} />;
  return (
    <div>
      <ul aria-label={p.label} className="divide-y divide-border">
        {p.threads.map((t) => (
          <ThreadListItem key={t.id} thread={t} selected={t.id === p.selectedId} onSelect={p.onSelect} />
        ))}
      </ul>
      {p.hasMore && (
        <div className="flex justify-center p-4">
          <Button variant="ghost" loading={p.loadingMore} onClick={p.onLoadMore}>
            さらに読み込む
          </Button>
        </div>
      )}
    </div>
  );
}

export function DraftList({
  drafts,
  onOpen,
  loading,
  error,
  onRetry,
}: {
  drafts: DraftSummary[];
  onOpen: (id: string) => void;
  loading: boolean;
  error: string | null;
  onRetry: () => void;
}) {
  if (loading && drafts.length === 0) return <ListSkeleton />;
  if (error && drafts.length === 0) return <ErrorState message={error} onRetry={onRetry} />;
  if (drafts.length === 0) return <EmptyState title="下書きはありません" />;
  return (
    <ul aria-label="下書き" className="divide-y divide-border">
      {drafts.map((d) => (
        <li key={d.id}>
          <button
            type="button"
            onClick={() => onOpen(d.id)}
            className="flex w-full flex-col gap-0.5 px-4 py-3 text-left hover:bg-surface-2 focus-visible:outline-2 focus-visible:outline-accent"
          >
            <span className="flex items-center gap-2 text-sm">
              <span className="font-semibold text-danger">下書き</span>
              <span className="min-w-0 flex-1 truncate text-text">
                {d.to.map((a) => displayName(a)).join(", ") || "(宛先なし)"}
              </span>
              <time dateTime={d.updatedAt} className="text-xs text-muted">
                {formatListDate(d.updatedAt)}
              </time>
            </span>
            <span className="truncate text-sm text-text">{d.subject || "(件名なし)"}</span>
            <span className="truncate text-xs text-muted">{d.snippet}</span>
          </button>
        </li>
      ))}
    </ul>
  );
}
