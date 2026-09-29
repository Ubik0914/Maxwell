"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarcodeIcon,
  BookIcon,
  CloseIcon,
  ListIcon,
  PlusIcon,
  SearchIcon,
  TrashIcon,
} from "@/components/icons";
import { useToast } from "@/components/Toast";
import { logoutAction } from "@/features/auth/actions";
import { deleteBookAction } from "@/features/library/actions";
import { BookDialog } from "@/components/library/BookDialog";
import { BookCover } from "@/components/library/BookCover";
import { ActionPanel, type Action } from "@/components/library/ActionPanel";
import {
  FooterButton,
  Kbd,
  Window,
  WindowBar,
  WindowFooter,
} from "@/components/library/Window";
import {
  filterBooks,
  libraryStats,
  sortBooks,
  type BookSort,
  type ShelvedBook,
} from "@/domain/library/filter";
import { formatIsbn } from "@/domain/library/isbn";

const SORT_LABEL: Record<BookSort, string> = {
  recent: "登録が新しい順",
  title: "書名順",
  author: "著者順",
  published: "発売が新しい順",
};

const yen = new Intl.NumberFormat("ja-JP");

/** Is a key press meant for a text field rather than for the list? */
function typingElsewhere(target: EventTarget | null, search: Element | null) {
  if (!(target instanceof HTMLElement)) return false;
  if (target === search) return false;
  return (
    target.isContentEditable ||
    ["INPUT", "TEXTAREA", "SELECT"].includes(target.tagName)
  );
}

/**
 * The library, laid out like a Raycast command: search on top, the
 * shelf as a list you walk with ↑↓, the selected book's details on the
 * right, and the footer naming what ↵ and ⌘K do.
 *
 * Adding is still scan-first — the footer's first button, the empty
 * shelf's only button, and the top of ⌘K's 追加 section all go to
 * /scan. Typing a book in by hand is an action in the panel, not a peer
 * of the scanner.
 *
 * The books arrive rendered from the server and are kept here after
 * that. A save answers with the row as the database now holds it, so
 * the list is updated from that rather than by re-fetching the shelf.
 */
export function LibraryScreen({
  initialBooks,
  userEmail,
}: {
  initialBooks: ShelvedBook[];
  userEmail: string;
}) {
  const router = useRouter();
  const { showError, showSuccess } = useToast();
  const searchRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());

  const [books, setBooks] = useState(initialBooks);
  const [query, setQuery] = useState("");
  const [lentOnly, setLentOnly] = useState(false);
  const [sort, setSort] = useState<BookSort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShelvedBook | "new" | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);

  const stats = useMemo(() => libraryStats(books), [books]);
  const shown = useMemo(
    () => sortBooks(filterBooks(books, { query, lentOnly }), sort),
    [books, query, lentOnly, sort],
  );

  // The selection follows the list: if the selected book is filtered
  // out, the first one that is left is selected instead.
  const selectedIndex = Math.max(
    shown.findIndex((book) => book.id === selectedId),
    0,
  );
  const selected: ShelvedBook | undefined = shown[selectedIndex];

  const select = useCallback(
    (index: number) => {
      const book = shown[index];
      if (!book) return;
      setSelectedId(book.id);
      rowRefs.current.get(book.id)?.scrollIntoView({ block: "nearest" });
    },
    [shown],
  );

  const scan = useCallback(() => router.push("/scan"), [router]);

  const remove = useCallback(
    async (book: ShelvedBook) => {
      if (!window.confirm(`「${book.title}」を削除しますか？`)) return;
      const result = await deleteBookAction(book.id);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      setBooks((current) => current.filter((b) => b.id !== book.id));
      showSuccess("削除しました");
    },
    [showError, showSuccess],
  );

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    if (selected) {
      list.push(
        {
          id: "open",
          section: selected.title,
          title: "開いて編集",
          icon: <BookIcon />,
          keys: ["↵"],
          run: () => setEditing(selected),
        },
        {
          id: "lend",
          section: selected.title,
          title: selected.lent_to ? "貸出先を変更…" : "貸し出す…",
          icon: <ListIcon />,
          run: () => setEditing(selected),
        },
      );
      if (selected.isbn) {
        const isbn = selected.isbn;
        list.push({
          id: "copy-isbn",
          section: selected.title,
          title: "ISBN をコピー",
          icon: <ListIcon />,
          run: () => {
            navigator.clipboard
              ?.writeText(isbn)
              .then(() => showSuccess("ISBN をコピーしました"))
              .catch(() => showError("コピーできませんでした"));
          },
        });
      }
      list.push({
        id: "delete",
        section: selected.title,
        title: "削除…",
        icon: <TrashIcon />,
        danger: true,
        run: () => void remove(selected),
      });
    }
    list.push(
      {
        id: "scan",
        section: "追加",
        title: "スキャンして追加",
        icon: <BarcodeIcon />,
        run: scan,
      },
      {
        id: "manual",
        section: "追加",
        title: "手入力で追加",
        icon: <PlusIcon />,
        run: () => setEditing("new"),
      },
      {
        id: "lent-only",
        section: "表示",
        title: lentOnly ? "すべての本を表示" : "貸出中の本だけ表示",
        icon: <SearchIcon />,
        run: () => setLentOnly((on) => !on),
      },
      ...(Object.keys(SORT_LABEL) as BookSort[])
        .filter((option) => option !== sort)
        .map((option) => ({
          id: `sort-${option}`,
          section: "表示",
          title: `並び順: ${SORT_LABEL[option]}`,
          icon: <ListIcon />,
          run: () => setSort(option),
        })),
      {
        id: "logout",
        section: "アカウント",
        title: `ログアウト（${userEmail}）`,
        icon: <CloseIcon />,
        run: () => void logoutAction(),
      },
    );
    return list;
  }, [
    selected,
    lentOnly,
    sort,
    userEmail,
    scan,
    remove,
    showError,
    showSuccess,
  ]);

  // The list's keyboard. Typing goes to the search box wherever focus
  // is, the way Raycast's does; ↑↓ move the selection, ↵ opens it,
  // ⌘K opens the actions, and Escape clears the search.
  useEffect(() => {
    if (editing || actionsOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (typingElsewhere(event.target, searchRef.current)) return;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setActionsOpen(true);
      } else if (event.key === "ArrowDown") {
        event.preventDefault();
        select(Math.min(selectedIndex + 1, shown.length - 1));
      } else if (event.key === "ArrowUp") {
        event.preventDefault();
        select(Math.max(selectedIndex - 1, 0));
      } else if (event.key === "Enter" && selected) {
        event.preventDefault();
        setEditing(selected);
      } else if (event.key === "Escape" && query) {
        event.preventDefault();
        setQuery("");
      } else if (
        event.key.length === 1 &&
        !mod &&
        !event.altKey &&
        document.activeElement !== searchRef.current
      ) {
        searchRef.current?.focus();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [
    editing,
    actionsOpen,
    select,
    selectedIndex,
    shown.length,
    selected,
    query,
  ]);

  function saved(book: ShelvedBook) {
    setBooks((current) =>
      current.some((b) => b.id === book.id)
        ? current.map((b) => (b.id === book.id ? book : b))
        : [book, ...current],
    );
    setSelectedId(book.id);
  }

  return (
    <Window>
      <WindowBar>
        <SearchIcon className="h-5 w-5 shrink-0 text-text-faint" />
        <input
          ref={searchRef}
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="本を検索…"
          aria-label="蔵書を検索"
          autoComplete="off"
          className="min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-faint focus:outline-none sm:text-lg"
        />
        <button
          type="button"
          onClick={() => setLentOnly((on) => !on)}
          aria-pressed={lentOnly}
          className={`shrink-0 rounded-md border px-2 py-1 text-xs transition-colors ${
            lentOnly
              ? "border-accent/60 bg-accent-soft text-accent"
              : "border-border text-text-muted hover:bg-surface-hover"
          }`}
        >
          貸出中
        </button>
      </WindowBar>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto md:max-w-[55%] md:border-r md:border-border">
          {books.length === 0 ? (
            <EmptyShelf onScan={scan} />
          ) : (
            <>
              <p className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-4 pt-3 pb-1.5 text-[11px] font-semibold text-text-faint backdrop-blur">
                <span>
                  {lentOnly ? "貸出中" : "本"} · {SORT_LABEL[sort]}
                </span>
                <span className="font-normal tabular-nums">
                  {shown.length === books.length
                    ? `${books.length}冊`
                    : `${shown.length} / ${books.length}冊`}
                </span>
              </p>
              {shown.length === 0 ? (
                <p className="px-4 py-12 text-center text-sm text-text-muted">
                  該当する本はありません
                </p>
              ) : (
                <ul role="listbox" aria-label="蔵書" className="px-2 pb-2">
                  {shown.map((book, index) => (
                    <li
                      key={book.id}
                      ref={(element) => {
                        if (element) rowRefs.current.set(book.id, element);
                        else rowRefs.current.delete(book.id);
                      }}
                    >
                      <BookRow
                        book={book}
                        selected={index === selectedIndex}
                        onSelect={() => setSelectedId(book.id)}
                        onOpen={() => {
                          setSelectedId(book.id);
                          setEditing(book);
                        }}
                      />
                    </li>
                  ))}
                </ul>
              )}
            </>
          )}
        </div>

        <aside className="hidden min-w-0 flex-1 overflow-y-auto md:block">
          {selected ? (
            <BookDetail book={selected} />
          ) : (
            <ShelfSummary
              total={stats.total}
              lent={stats.lent}
              value={stats.value}
            />
          )}
        </aside>
      </div>

      <div className="relative">
        {actionsOpen && (
          <ActionPanel
            actions={actions}
            onClose={() => setActionsOpen(false)}
          />
        )}
        <WindowFooter
          left={
            <>
              <BookIcon className="text-accent" />
              <span className="truncate">
                蔵書 · {stats.total}冊
                {stats.lent > 0 && ` · 貸出中 ${stats.lent}`}
              </span>
            </>
          }
        >
          <FooterButton onClick={scan} primary>
            <BarcodeIcon className="text-accent" />
            スキャンして追加
          </FooterButton>
          {selected && (
            <span className="hidden sm:contents">
              <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
              <FooterButton onClick={() => setEditing(selected)} keys={["↵"]}>
                開く
              </FooterButton>
            </span>
          )}
          <span className="mx-1 h-4 w-px bg-border" aria-hidden="true" />
          <FooterButton
            onClick={() => setActionsOpen((open) => !open)}
            keys={["⌘", "K"]}
          >
            アクション
          </FooterButton>
        </WindowFooter>
      </div>

      {editing && (
        <BookDialog
          book={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={saved}
          onDeleted={(bookId) =>
            setBooks((current) => current.filter((b) => b.id !== bookId))
          }
        />
      )}
    </Window>
  );
}

/**
 * One list item: cover as the icon, title and author as the text, and
 * the "accessories" Raycast puts on the right — who has it, where it is.
 * Clicking selects (and on a phone, where there is no detail pane,
 * opens); double-clicking opens.
 */
function BookRow({
  book,
  selected,
  onSelect,
  onOpen,
}: {
  book: ShelvedBook;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => {
        if (window.matchMedia("(min-width: 768px)").matches) onSelect();
        else onOpen();
      }}
      onDoubleClick={onOpen}
      className={`flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition-colors ${
        selected ? "bg-surface-hover" : "hover:bg-surface-hover/60"
      }`}
    >
      <BookCover
        title={book.title}
        isbn={book.isbn}
        coverUrl={book.cover_url}
        size="sm"
      />
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-text">{book.title}</span>
        {book.authors && (
          <span className="block truncate text-xs text-text-faint">
            {book.authors}
          </span>
        )}
      </span>
      <span className="flex shrink-0 items-center gap-1.5">
        {book.lent_to && (
          <span className="max-w-24 truncate rounded bg-accent-soft px-1.5 py-0.5 text-[11px] text-accent">
            {book.lent_to}
          </span>
        )}
        {book.location && (
          <span className="hidden max-w-24 truncate text-[11px] text-text-faint sm:inline">
            {book.location}
          </span>
        )}
      </span>
    </button>
  );
}

/** Raycast's detail pane: a picture on top, then label / value rows. */
function BookDetail({ book }: { book: ShelvedBook }) {
  const rows: [string, string | null][] = [
    ["著者", book.authors],
    ["出版社", book.publisher],
    ["発売", book.published],
    ["価格", book.price == null ? null : `¥${yen.format(book.price)}`],
    ["ISBN", book.isbn ? formatIsbn(book.isbn) : null],
    ["場所", book.location],
    ["貸出先", book.lent_to],
  ];

  return (
    <div className="flex flex-col gap-4 p-5">
      <BookCover
        title={book.title}
        isbn={book.isbn}
        coverUrl={book.cover_url}
        size="lg"
        className="self-center"
      />
      <h2 className="text-center text-base font-semibold text-text">
        {book.title}
      </h2>
      <dl className="flex flex-col divide-y divide-border border-t border-border text-sm">
        {rows.map(([label, value]) => (
          <div key={label} className="flex items-baseline gap-4 py-2">
            <dt className="w-16 shrink-0 text-xs text-text-faint">{label}</dt>
            <dd
              className={`min-w-0 flex-1 text-right break-words ${
                value ? "text-text" : "text-text-faint"
              }`}
            >
              {value ?? "—"}
            </dd>
          </div>
        ))}
      </dl>
      {book.note && (
        <p className="rounded-md bg-bg/40 p-3 text-xs whitespace-pre-wrap text-text-muted">
          {book.note}
        </p>
      )}
      <p className="flex items-center justify-center gap-1.5 text-[11px] text-text-faint">
        <Kbd>↵</Kbd> で編集 · <Kbd>⌘</Kbd>
        <Kbd>K</Kbd> でアクション
      </p>
    </div>
  );
}

function ShelfSummary({
  total,
  lent,
  value,
}: {
  total: number;
  lent: number;
  value: number;
}) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-sm text-text-muted">
      <p>{total}冊</p>
      <p className="text-xs text-text-faint">
        貸出中 {lent} · 総額 ¥{yen.format(value)}
      </p>
    </div>
  );
}

function EmptyShelf({ onScan }: { onScan: () => void }) {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-3 px-6 py-16 text-center">
      <BarcodeIcon className="h-8 w-8 text-text-faint" />
      <p className="text-sm text-text-muted">まだ本が登録されていません</p>
      <button
        type="button"
        onClick={onScan}
        className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover"
      >
        <BarcodeIcon />
        スキャンして追加
      </button>
    </div>
  );
}
