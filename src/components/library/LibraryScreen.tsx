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
import { refreshBookAction } from "@/features/library/actions";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { useEscapeKey } from "@/hooks/useEscapeKey";
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
  const [sort, setSort] = useState<BookSort>("recent");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShelvedBook | "new" | null>(null);
  // ⌘K's 削除 opens the book with its own delete confirmation already
  // showing, rather than a browser confirm() box over the page.
  const [deleting, setDeleting] = useState(false);
  const [actionsOpen, setActionsOpen] = useState(false);
  // Phones have no room for a detail pane; tapping a book opens it as a
  // sheet instead, and editing is one more tap from there.
  const [viewing, setViewing] = useState<ShelvedBook | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const stats = useMemo(() => libraryStats(books), [books]);
  const shown = useMemo(
    () => sortBooks(filterBooks(books, { query }), sort),
    [books, query, sort],
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

  const refresh = useCallback(
    async (book: ShelvedBook) => {
      setRefreshing(book.id);
      const result = await refreshBookAction(book.id);
      setRefreshing(null);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      const { book: updated, filled } = result.data;
      setBooks((current) =>
        current.map((b) => (b.id === updated.id ? updated : b)),
      );
      setViewing((open) => (open?.id === updated.id ? updated : open));
      showSuccess(
        filled.length > 0
          ? `${filled.map((key) => FIELD_LABEL[key]).join("・")}を補完しました`
          : "新しく取得できた情報はありませんでした",
      );
    },
    [showError, showSuccess],
  );

  const actions = useMemo<Action[]>(() => {
    const list: Action[] = [];
    if (selected) {
      list.push({
        id: "open",
        section: selected.title,
        title: "開いて編集",
        icon: <BookIcon />,
        keys: ["↵"],
        run: () => setEditing(selected),
      });
      if (selected.isbn && missingDetails(selected)) {
        list.push({
          id: "refresh",
          section: selected.title,
          title: "書誌を再取得（価格・表紙などを補完）",
          icon: <SearchIcon />,
          run: () => void refresh(selected),
        });
      }
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
        run: () => {
          setDeleting(true);
          setEditing(selected);
        },
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
  }, [selected, sort, userEmail, scan, refresh, showError, showSuccess]);

  // The list's keyboard. Typing goes to the search box wherever focus
  // is, the way Raycast's does; ↑↓ move the selection, ↵ opens it,
  // ⌘K opens the actions, and Escape clears the search.
  useEffect(() => {
    if (editing || actionsOpen || viewing) return;

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
    viewing,
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
          className="min-h-11 min-w-0 flex-1 bg-transparent text-base text-text placeholder:text-text-faint focus:outline-none sm:min-h-0 sm:text-lg"
        />
      </WindowBar>

      <div className="flex min-h-0 flex-1">
        <div className="flex min-w-0 flex-1 flex-col overflow-y-auto md:max-w-[55%] md:border-r md:border-border">
          {books.length === 0 ? (
            <EmptyShelf onScan={scan} />
          ) : (
            <>
              <p className="sticky top-0 z-10 flex items-center justify-between bg-surface/95 px-4 pt-3 pb-1.5 text-[11px] font-semibold text-text-faint backdrop-blur">
                <span>本 · {SORT_LABEL[sort]}</span>
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
                      className="lib-row"
                      style={{ "--i": index } as React.CSSProperties}
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
                        onView={() => {
                          setSelectedId(book.id);
                          setViewing(book);
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
            <div key={selected.id} className="lib-detail">
              <BookDetail
                book={selected}
                refreshing={refreshing === selected.id}
                onEdit={() => setEditing(selected)}
                onRefresh={() => void refresh(selected)}
              />
            </div>
          ) : (
            <ShelfSummary total={stats.total} value={stats.value} />
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
              <span className="truncate">蔵書 · {stats.total}冊</span>
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

      {viewing && !editing && (
        <DetailSheet
          book={viewing}
          refreshing={refreshing === viewing.id}
          onClose={() => setViewing(null)}
          onEdit={() => setEditing(viewing)}
          onRefresh={() => void refresh(viewing)}
        />
      )}

      {editing && (
        <BookDialog
          book={editing === "new" ? undefined : editing}
          confirmingDelete={deleting}
          onClose={() => {
            setEditing(null);
            setDeleting(false);
          }}
          onSaved={(book) => {
            saved(book);
            setViewing((open) => (open?.id === book.id ? book : open));
          }}
          onDeleted={(bookId) => {
            setBooks((current) => current.filter((b) => b.id !== bookId));
            setViewing(null);
            showSuccess("削除しました");
          }}
        />
      )}
    </Window>
  );
}

/** The line under the author: who published it, when, for how much. */
function imprint(book: ShelvedBook): string {
  return [
    book.publisher,
    book.published,
    book.price == null ? null : `¥${yen.format(book.price)}`,
  ]
    .filter(Boolean)
    .join(" · ");
}

/**
 * One list item: cover as the icon, and the text on three lines —
 * title, author, then publisher · date · price — so the imprint is not
 * run together with the author the way one long line did. Raycast's
 * "accessory" sits on the right: where it is.
 *
 * Clicking selects on a desktop, where the detail pane shows it; on a
 * phone, where there is no pane, it opens the detail sheet.
 */
function BookRow({
  book,
  selected,
  onSelect,
  onOpen,
  onView,
}: {
  book: ShelvedBook;
  selected: boolean;
  onSelect: () => void;
  onOpen: () => void;
  onView: () => void;
}) {
  const line = imprint(book);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={() => {
        if (window.matchMedia("(min-width: 768px)").matches) onSelect();
        else onView();
      }}
      onDoubleClick={onOpen}
      className={`lib-select flex w-full items-center gap-3 rounded-lg px-2 py-2 text-left ${
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
          <span className="block truncate text-xs text-text-muted">
            {book.authors}
          </span>
        )}
        {line && (
          <span className="block truncate text-[11px] text-text-faint">
            {line}
          </span>
        )}
      </span>
      <span className="flex shrink-0 flex-col items-end gap-1">
        {book.location && (
          <span className="max-w-24 truncate text-[11px] text-text-faint">
            {book.location}
          </span>
        )}
      </span>
    </button>
  );
}

const FIELD_LABEL: Record<string, string> = {
  authors: "著者",
  publisher: "出版社",
  published: "発売",
  price: "価格",
  cover_url: "表紙",
};

/** Whether a re-lookup could still add something to this book. */
function missingDetails(book: ShelvedBook): boolean {
  return (
    !book.authors ||
    !book.publisher ||
    !book.published ||
    book.price == null ||
    !book.cover_url
  );
}

/**
 * Raycast's detail pane: a picture on top, then the metadata. Each label
 * sits on its own line above its value — a long publisher or a pair of
 * translators reads as one block instead of being squeezed against the
 * right edge.
 */
function BookDetail({
  book,
  refreshing,
  onEdit,
  onRefresh,
  compact = false,
}: {
  book: ShelvedBook;
  refreshing: boolean;
  onEdit: () => void;
  onRefresh: () => void;
  compact?: boolean;
}) {
  const rows: [string, string | null][] = [
    ["著者", book.authors],
    ["出版社", book.publisher],
    ["発売", book.published],
    ["価格", book.price == null ? null : `¥${yen.format(book.price)}`],
    ["ISBN", book.isbn ? formatIsbn(book.isbn) : null],
    ["場所", book.location],
  ];

  return (
    <div className={`flex flex-col gap-4 ${compact ? "" : "p-5"}`}>
      <div className="flex items-start gap-4">
        <BookCover
          title={book.title}
          isbn={book.isbn}
          coverUrl={book.cover_url}
          size="lg"
          className="shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
        />
        <div className="flex min-w-0 flex-1 flex-col gap-1 pt-1">
          <h2 className="text-base leading-snug font-semibold text-text">
            {book.title}
          </h2>
          {book.authors && (
            <p className="text-sm text-text-muted">{book.authors}</p>
          )}
        </div>
      </div>

      <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-border pt-4 text-sm">
        {rows.map(([label, value]) => (
          <div
            key={label}
            className={
              label === "著者" || label === "出版社" ? "col-span-2" : ""
            }
          >
            <dt className="text-[11px] text-text-faint">{label}</dt>
            <dd
              className={`mt-0.5 break-words ${
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

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          onClick={onEdit}
          className="rounded-md bg-surface-hover text-text transition-[transform,background-color] hover:bg-border active:scale-[0.97] min-h-11 px-4 py-2.5 text-base sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-sm"
        >
          編集
        </button>
        {book.isbn && missingDetails(book) && (
          <button
            type="button"
            onClick={onRefresh}
            disabled={refreshing}
            className="flex items-center gap-1.5 rounded-md border border-border text-text-muted transition-[transform,background-color] hover:bg-surface-hover hover:text-text active:scale-[0.97] disabled:opacity-60 min-h-11 px-4 py-2.5 text-base sm:min-h-0 sm:px-3 sm:py-1.5 sm:text-sm"
          >
            {refreshing ? <Spinner /> : <SearchIcon />}
            書誌を再取得
          </button>
        )}
      </div>

      {!compact && (
        <p className="flex items-center gap-1.5 text-[11px] text-text-faint">
          <Kbd>↵</Kbd> で編集 · <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> でアクション
        </p>
      )}
    </div>
  );
}

/** The detail pane, as a sheet, for screens too narrow to show it. */
function DetailSheet({
  book,
  refreshing,
  onClose,
  onEdit,
  onRefresh,
}: {
  book: ShelvedBook;
  refreshing: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  useEscapeKey(onClose, true, { exclusive: true });
  return (
    <Modal
      title="本の詳細"
      onClose={onClose}
      width="max-w-md"
      fullScreenOnMobile
    >
      <BookDetail
        book={book}
        refreshing={refreshing}
        onEdit={onEdit}
        onRefresh={onRefresh}
        compact
      />
    </Modal>
  );
}

function ShelfSummary({ total, value }: { total: number; value: number }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-sm text-text-muted">
      <p>{total}冊</p>
      <p className="text-xs text-text-faint">総額 ¥{yen.format(value)}</p>
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
        className="flex items-center gap-2 rounded-md bg-accent font-medium text-inverse transition-colors hover:bg-accent-hover min-h-11 px-5 py-2.5 text-base sm:min-h-0 sm:px-4 sm:py-2 sm:text-sm"
      >
        <BarcodeIcon />
        スキャンして追加
      </button>
    </div>
  );
}
