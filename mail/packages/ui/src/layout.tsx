import type { ReactNode } from "react";
import { cx } from "./format";
import { IconCompose, IconDraft, IconInbox, IconSettings } from "./icons";

/**
 * 画面レイアウト。PC（lg以上）は ナビ｜一覧｜詳細 の3ペイン、
 * スマホは一覧→詳細の単一ペイン遷移。切り替えはCSSのみで行い、メール操作のロジックに影響させない。
 */
export function MailLayout({
  nav,
  list,
  detail,
  showDetailOnMobile,
  overlay,
}: {
  nav: ReactNode;
  list: ReactNode;
  detail: ReactNode;
  /** スマホ表示で詳細ペインを出すか */
  showDetailOnMobile: boolean;
  overlay?: ReactNode;
}) {
  return (
    <div className="flex h-dvh w-full overflow-hidden bg-bg text-text">
      <aside className="hidden w-pane-nav shrink-0 border-r border-border bg-surface lg:flex lg:flex-col">{nav}</aside>
      <section
        className={cx(
          "min-w-0 flex-col border-r border-border bg-surface md:flex md:w-pane-list md:shrink-0",
          showDetailOnMobile ? "hidden" : "flex w-full",
        )}
        aria-label="メール一覧"
      >
        {list}
      </section>
      <main className={cx("min-w-0 flex-1 flex-col bg-bg md:flex", showDetailOnMobile ? "flex" : "hidden")}>{detail}</main>
      {overlay}
    </div>
  );
}

export type Folder = "inbox" | "drafts";

export function NavMenu({
  folder,
  onFolder,
  onCompose,
  settingsHref,
  accountEmail,
  unreadCount,
}: {
  folder: Folder | "search";
  onFolder: (f: Folder) => void;
  onCompose: () => void;
  settingsHref: string;
  accountEmail: string | null;
  unreadCount?: number;
}) {
  const item = (f: Folder, label: string, icon: ReactNode, count?: number) => (
    <button
      type="button"
      onClick={() => onFolder(f)}
      aria-current={folder === f ? "page" : undefined}
      className={cx(
        "flex min-h-touch w-full items-center gap-3 rounded-md px-3 text-sm",
        folder === f ? "bg-selected font-semibold text-text" : "text-text hover:bg-surface-2",
      )}
    >
      {icon}
      <span className="flex-1 text-left">{label}</span>
      {!!count && <span className="text-xs text-muted">{count}</span>}
    </button>
  );
  return (
    <nav aria-label="フォルダ" className="flex h-full flex-col gap-1 p-3">
      <p className="px-3 pb-2 text-base font-bold tracking-wide text-text">Synedge</p>
      <button
        type="button"
        onClick={onCompose}
        className="mb-2 flex min-h-touch items-center gap-2 rounded-md bg-accent px-4 text-sm font-semibold text-accent-fg hover:opacity-90"
      >
        <IconCompose size={18} /> 新規作成
      </button>
      {item("inbox", "受信トレイ", <IconInbox size={18} />, unreadCount)}
      {item("drafts", "下書き", <IconDraft size={18} />)}
      <div className="flex-1" />
      <a href={settingsHref} className="flex min-h-touch items-center gap-3 rounded-md px-3 text-sm text-text hover:bg-surface-2">
        <IconSettings size={18} /> 設定
      </a>
      {accountEmail && <p className="truncate px-3 text-xs text-muted">{accountEmail}</p>}
    </nav>
  );
}

/** スマホ用の作成ボタン（親指で押しやすい右下） */
export function ComposeFab({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label="新規作成"
      className="fixed right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-30 flex size-14 items-center justify-center rounded-full bg-accent text-accent-fg shadow-lg md:hidden"
    >
      <IconCompose />
    </button>
  );
}
