"use client";

import type { ReactNode } from "react";
import {
  BarcodeIcon,
  BookIcon,
  KeyIcon,
  LogoutIcon,
  PlusIcon,
  RefreshIcon,
} from "@/components/icons";
import { Spinner } from "@/components/Spinner";
import type { Shelf } from "@/domain/library/filter";

/** Which shelf the list shows: all of them (`undefined`), one, or none. */
export type ShelfChoice = string | null | undefined;

/**
 * The desktop's left column: adding first, then the shelves to walk,
 * then the chores and the account at the foot.
 *
 * A phone has no room for it; there the same things are in ⌘K's panel.
 */
export function LibrarySidebar({
  total,
  shelves,
  shelf,
  onShelf,
  onScan,
  onManual,
  onRefreshAll,
  refreshProgress,
  userEmail,
  onLogout,
  onRegisterPasskey,
}: {
  total: number;
  shelves: Shelf[];
  shelf: ShelfChoice;
  onShelf: (shelf: ShelfChoice) => void;
  onScan: () => void;
  onManual: () => void;
  onRefreshAll: () => void;
  refreshProgress: { done: number; total: number } | null;
  userEmail: string;
  onLogout: () => void;
  onRegisterPasskey: () => void;
}) {
  return (
    <nav
      aria-label="蔵書"
      className="hidden w-60 shrink-0 flex-col border-r border-border bg-bg/60 md:flex"
    >
      <div className="flex items-center gap-2 px-4 pt-4 pb-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-lg bg-accent-soft text-accent">
          <BookIcon />
        </span>
        <span className="text-sm font-semibold text-text">蔵書</span>
      </div>

      <div className="px-3 pb-3">
        <button
          type="button"
          onClick={onScan}
          className="flex h-9 w-full items-center justify-center gap-2 rounded-lg bg-accent text-sm font-medium text-inverse shadow-[0_6px_20px_var(--accent-soft)] transition-[transform,background-color] hover:bg-accent-hover active:scale-[0.97]"
        >
          <BarcodeIcon />
          スキャンして追加
        </button>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
        <SidebarItem
          active={shelf === undefined}
          onClick={() => onShelf(undefined)}
          count={total}
        >
          すべての本
        </SidebarItem>

        {shelves.length > 0 && (
          <>
            <p className="px-2 pt-4 pb-1 text-[11px] font-semibold text-text-faint">
              場所
            </p>
            {shelves.map(({ name, count }) => (
              <SidebarItem
                key={name ?? ""}
                active={shelf === name}
                onClick={() => onShelf(name)}
                count={count}
                muted={name === null}
              >
                {name ?? "場所未設定"}
              </SidebarItem>
            ))}
          </>
        )}
      </div>

      <div className="flex flex-col gap-0.5 border-t border-border p-2">
        <SidebarButton onClick={onManual} icon={<PlusIcon />}>
          手入力で追加
        </SidebarButton>
        <SidebarButton
          onClick={onRefreshAll}
          disabled={refreshProgress !== null}
          icon={refreshProgress ? <Spinner /> : <RefreshIcon />}
        >
          {refreshProgress ? (
            <span aria-live="polite">
              再取得中 {refreshProgress.done}/{refreshProgress.total}
            </span>
          ) : (
            "書誌を一括再取得"
          )}
        </SidebarButton>
        <div className="mt-1 flex items-center gap-2 border-t border-border px-2 pt-2">
          <span className="min-w-0 flex-1 truncate text-xs text-text-faint">
            {userEmail}
          </span>
          <button
            type="button"
            onClick={onRegisterPasskey}
            aria-label="パスキーを登録"
            title="パスキーを登録"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <KeyIcon />
          </button>
          <button
            type="button"
            onClick={onLogout}
            aria-label="ログアウト"
            title="ログアウト"
            className="flex h-8 w-8 items-center justify-center rounded-lg text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
          >
            <LogoutIcon />
          </button>
        </div>
      </div>
    </nav>
  );
}

function SidebarItem({
  active,
  onClick,
  count,
  muted = false,
  children,
}: {
  active: boolean;
  onClick: () => void;
  count: number;
  muted?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "page" : undefined}
      className={`flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm transition-colors ${
        active
          ? "bg-surface-hover text-text"
          : `${muted ? "text-text-faint" : "text-text-muted"} hover:bg-surface-hover/60 hover:text-text`
      }`}
    >
      <span className="min-w-0 flex-1 truncate">{children}</span>
      <span className="text-xs text-text-faint tabular-nums">{count}</span>
    </button>
  );
}

function SidebarButton({
  onClick,
  icon,
  disabled = false,
  children,
}: {
  onClick: () => void;
  icon: ReactNode;
  disabled?: boolean;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex h-8 w-full items-center gap-2 rounded-lg px-2 text-left text-sm text-text-muted transition-colors hover:bg-surface-hover/60 hover:text-text disabled:opacity-60"
    >
      <span className="flex w-4 justify-center text-text-faint">{icon}</span>
      <span className="min-w-0 flex-1 truncate">{children}</span>
    </button>
  );
}

const yen = new Intl.NumberFormat("ja-JP");

/**
 * The shelf's figures, as a quiet line in the header: useful to glance
 * at, never what the screen is for, so they get no more room than a
 * caption. Desktop only; a phone's footer already counts the books.
 */
export function ShelfStats({
  total,
  value,
  authors,
  recent,
}: {
  total: number;
  value: number;
  authors: number;
  recent: number;
}) {
  const figures: [string, string][] = [
    ["蔵書", `${total}冊`],
    ["総額", `¥${yen.format(value)}`],
    ["著者", `${authors}人`],
    ["30日間の追加", `${recent}冊`],
  ];
  return (
    <dl className="hidden shrink-0 items-center gap-4 text-xs md:flex">
      {figures.map(([label, figure], index) => (
        <div
          key={label}
          className={`flex items-baseline gap-1.5 ${
            // The last two give way first when the header is narrow.
            index >= 2 ? "hidden lg:flex" : ""
          }`}
        >
          <dt className="text-text-faint">{label}</dt>
          <dd className="text-text-muted tabular-nums">{figure}</dd>
        </div>
      ))}
    </dl>
  );
}
