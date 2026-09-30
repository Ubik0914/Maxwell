"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import {
  BarcodeIcon,
  BookIcon,
  CopyIcon,
  GridIcon,
  ListIcon,
  PinIcon,
  LogoutIcon,
  MoreIcon,
  PencilIcon,
  PlusIcon,
  RefreshIcon,
  SearchIcon,
  SortIcon,
  TrashIcon,
} from "@/components/icons";
import { useToast } from "@/components/Toast";
import { logoutAction } from "@/features/auth/actions";
import {
  refreshBookAction,
  refreshBooksAction,
} from "@/features/library/actions";
import { Modal } from "@/components/Modal";
import { Spinner } from "@/components/Spinner";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { BookDialog } from "@/components/library/BookDialog";
import { SCAN_FROM_LIBRARY } from "@/components/library/navigation";
import { BookCover } from "@/components/library/BookCover";
import { CoverLightbox } from "@/components/library/CoverLightbox";
import { ActionPanel, type Action } from "@/components/library/ActionPanel";
import {
  LibrarySidebar,
  ShelfStats,
  type ShelfChoice,
} from "@/components/library/LibrarySidebar";
import {
  IconButton,
  Kbd,
  Window,
  WindowBar,
  WindowFooter,
} from "@/components/library/Window";
import {
  filterBooks,
  libraryStats,
  shelfOverview,
  shelves,
  sortBooks,
  type BookSort,
  type ShelvedBook,
} from "@/domain/library/filter";
import { formatIsbn } from "@/domain/library/isbn";
import { googleSearchUrl } from "@/domain/library/search";

const SORT_LABEL: Record<BookSort, string> = {
  recent: "登録が新しい順",
  title: "書名順",
  author: "著者順",
  published: "発売が新しい順",
};

const yen = new Intl.NumberFormat("ja-JP");

/** Wide enough for the detail pane beside the sidebar and the shelf. */
const DETAIL_PANE = "(min-width: 1280px)";

type View = "list" | "grid";
const VIEW_KEY = "library:view";

/** Icon size inside an IconButton: larger under a thumb, 16px with a mouse. */
const ICON = "h-5 w-5 sm:h-4 sm:w-4";

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
 * The library. On a desktop it is a dashboard: a sidebar of shelves on
 * the left, the figures across the top, the books as a list or a grid
 * of covers, and — where the screen is wide enough — the selected
 * book's details on the right. On a phone it is Raycast's single
 * column: search on top, the shelf, and the footer naming what ↵ and
 * ⌘K do, with the sidebar's contents in ⌘K.
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
  const gridRef = useRef<HTMLUListElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  const [books, setBooks] = useState(initialBooks);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<BookSort>("recent");
  const [shelf, setShelf] = useState<ShelfChoice>(undefined);
  const [view, setView] = useState<View>("list");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [editing, setEditing] = useState<ShelvedBook | "new" | null>(null);
  // ⌘K's 削除 opens the book with its own delete confirmation already
  // showing, rather than a browser confirm() box over the page.
  const [deleting, setDeleting] = useState(false);
  // ⌘K's panel, or — from the phone's tab bar — just its shelves.
  const [panel, setPanel] = useState<"all" | "shelves" | null>(null);
  const actionsOpen = panel !== null;
  // Phones have no room for a detail pane; tapping a book opens it as a
  // sheet instead, and editing is one more tap from there.
  const [viewing, setViewing] = useState<ShelvedBook | null>(null);
  const [refreshing, setRefreshing] = useState<string | null>(null);

  const stats = useMemo(() => libraryStats(books), [books]);
  const places = useMemo(() => shelves(books), [books]);
  // A shelf that has been emptied (its last book moved or deleted)
  // falls back to every shelf rather than showing nothing.
  const location =
    shelf !== undefined && places.some((place) => place.name === shelf)
      ? shelf
      : undefined;
  const onShelf = useMemo(
    () => filterBooks(books, { query: "", location }),
    [books, location],
  );
  const overview = useMemo(() => shelfOverview(onShelf), [onShelf]);
  const shown = useMemo(
    () => sortBooks(filterBooks(onShelf, { query }), sort),
    [onShelf, query, sort],
  );

  // List or grid is a per-person habit, so it is remembered in this
  // browser. Read after mounting: the server has no storage to render
  // it from, and the two renders have to agree.
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
      if (saved === "grid" || saved === "list") setView(saved);
    } catch {
      // No storage: the list it is.
    }
  }, []);

  const changeView = useCallback((next: View) => {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      // Only this visit, then.
    }
  }, []);

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

  const scan = useCallback(() => {
    try {
      sessionStorage.setItem(SCAN_FROM_LIBRARY, "1");
    } catch {
      // Without storage the scan screen simply replaces itself on leave.
    }
    router.push("/scan");
  }, [router]);

  // Scanning is the button this screen is mostly opened for; have the
  // scan screen's shell (app/scan/loading.tsx) ready before it is
  // pressed, so the sheet opens on the tap and the camera starts in it.
  useEffect(() => {
    router.prefetch("/scan");
  }, [router]);

  // The shelf-wide re-fetch: progress while it runs, null when idle.
  const [refreshAllProgress, setRefreshAllProgress] = useState<{
    done: number;
    total: number;
  } | null>(null);

  /**
   * 書誌を一括再取得: the same re-fetch a single book has, for every
   * book with an ISBN and a blank field — price, publisher, date,
   * author and cover alike (a missing cover is just another blank). A
   * few books per call, so the footer can count them off and no single
   * server call has to fit the whole shelf.
   */
  const refreshAll = useCallback(async () => {
    const targets = books
      .filter((book) => book.isbn && missingDetails(book))
      .map((book) => book.id);
    if (targets.length === 0) {
      showSuccess("補完が必要な本はありません");
      return;
    }

    const BATCH = 8;
    let updatedCount = 0;
    let failedCount = 0;
    setRefreshAllProgress({ done: 0, total: targets.length });

    for (let start = 0; start < targets.length; start += BATCH) {
      const result = await refreshBooksAction(
        targets.slice(start, start + BATCH),
      );
      if (!result.success) {
        showError(result.error.message);
        break;
      }
      const { updated } = result.data;
      updatedCount += updated.length;
      failedCount += result.data.failed;
      setBooks((current) =>
        current.map(
          (book) => updated.find((fresh) => fresh.id === book.id) ?? book,
        ),
      );
      setRefreshAllProgress({
        done: Math.min(start + BATCH, targets.length),
        total: targets.length,
      });
    }

    setRefreshAllProgress(null);
    showSuccess(
      `${updatedCount}冊の書誌を補完しました` +
        (failedCount > 0 ? `（${failedCount}冊は取得できませんでした）` : ""),
    );
  }, [books, showError, showSuccess]);

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
        title: "詳細を開く",
        icon: <BookIcon />,
        keys: ["↵"],
        run: () => setViewing(selected),
      });
      list.push({
        id: "edit",
        section: selected.title,
        title: "編集",
        icon: <PencilIcon />,
        keys: ["⌘", "E"],
        run: () => setEditing(selected),
      });
      if (selected.isbn && missingDetails(selected)) {
        list.push({
          id: "refresh",
          section: selected.title,
          title: "書誌を再取得（価格・表紙などを補完）",
          icon: <RefreshIcon />,
          run: () => void refresh(selected),
        });
      }
      if (selected.isbn) {
        const isbn = selected.isbn;
        list.push({
          id: "copy-isbn",
          section: selected.title,
          title: "ISBN をコピー",
          icon: <CopyIcon />,
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
      {
        id: "view",
        section: "表示",
        title: view === "list" ? "グリッド表示" : "リスト表示",
        icon: view === "list" ? <GridIcon /> : <ListIcon />,
        run: () => changeView(view === "list" ? "grid" : "list"),
      },
      ...[{ name: undefined as ShelfChoice, count: books.length }, ...places]
        .filter((place) => place.name !== location)
        .map((place) => ({
          id: `shelf-${place.name === undefined ? "all" : (place.name ?? "none")}`,
          section: "場所",
          title:
            place.name === undefined
              ? `すべての本（${place.count}）`
              : `${place.name ?? "場所未設定"}（${place.count}）`,
          icon: place.name === undefined ? <BookIcon /> : <PinIcon />,
          run: () => setShelf(place.name),
        })),
      {
        id: "refresh-all",
        section: "表示",
        title: "書誌を一括再取得（価格・表紙などを補完）",
        icon: <RefreshIcon />,
        run: () => void refreshAll(),
      },
      ...(Object.keys(SORT_LABEL) as BookSort[])
        .filter((option) => option !== sort)
        .map((option) => ({
          id: `sort-${option}`,
          section: "表示",
          title: `並び順: ${SORT_LABEL[option]}`,
          icon: <SortIcon />,
          run: () => setSort(option),
        })),
      {
        id: "logout",
        section: "アカウント",
        title: `ログアウト（${userEmail}）`,
        icon: <LogoutIcon />,
        run: () => void logoutAction(),
      },
    );
    return list;
  }, [
    selected,
    sort,
    view,
    changeView,
    books.length,
    places,
    location,
    userEmail,
    scan,
    refresh,
    refreshAll,
    showError,
    showSuccess,
  ]);

  // The list's keyboard. Typing goes to the search box wherever focus
  // is, the way Raycast's does; ↑↓ move the selection, ↵ opens it
  // (to read, not to edit — that is ⌘E), ⌘K opens the actions, and
  // Escape clears the search.
  useEffect(() => {
    if (editing || actionsOpen || viewing) return;

    function onKeyDown(event: KeyboardEvent) {
      if (typingElsewhere(event.target, searchRef.current)) return;
      const mod = event.metaKey || event.ctrlKey;

      if (mod && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setPanel("all");
      } else if (mod && event.key.toLowerCase() === "e" && selected) {
        event.preventDefault();
        setEditing(selected);
      } else if (event.key === "ArrowDown" || event.key === "ArrowUp") {
        // In the grid, up and down are a row of covers apart.
        const step =
          view === "grid" && gridRef.current
            ? getComputedStyle(gridRef.current).gridTemplateColumns.split(" ")
                .length
            : 1;
        event.preventDefault();
        select(
          event.key === "ArrowDown"
            ? Math.min(selectedIndex + step, shown.length - 1)
            : Math.max(selectedIndex - step, 0),
        );
      } else if (
        view === "grid" &&
        (event.key === "ArrowRight" || event.key === "ArrowLeft") &&
        document.activeElement !== searchRef.current
      ) {
        event.preventDefault();
        select(
          event.key === "ArrowRight"
            ? Math.min(selectedIndex + 1, shown.length - 1)
            : Math.max(selectedIndex - 1, 0),
        );
      } else if (event.key === "Enter" && selected) {
        event.preventDefault();
        setViewing(selected);
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
    view,
  ]);

  function saved(book: ShelvedBook) {
    setBooks((current) =>
      current.some((b) => b.id === book.id)
        ? current.map((b) => (b.id === book.id ? book : b))
        : [book, ...current],
    );
    setSelectedId(book.id);
  }

  const shelfName =
    location === undefined ? "すべての本" : (location ?? "場所未設定");
  const open = (book: ShelvedBook) => {
    setSelectedId(book.id);
    // The pane shows it where there is one; elsewhere it opens.
    if (!window.matchMedia(DETAIL_PANE).matches) setViewing(book);
  };
  const rowRef = (id: string) => (element: HTMLLIElement | null) => {
    if (element) rowRefs.current.set(id, element);
    else rowRefs.current.delete(id);
  };

  return (
    <Window wide>
      <div className="flex min-h-0 flex-1">
        <LibrarySidebar
          total={books.length}
          shelves={places}
          shelf={location}
          onShelf={setShelf}
          onScan={scan}
          onManual={() => setEditing("new")}
          onRefreshAll={() => void refreshAll()}
          refreshProgress={refreshAllProgress}
          userEmail={userEmail}
          onLogout={() => void logoutAction()}
        />

        <div className="flex min-w-0 flex-1 flex-col">
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
            <ShelfStats {...overview} />
            <ViewToggle view={view} onChange={changeView} />
          </WindowBar>

          <div className="flex min-h-0 flex-1">
            <div
              ref={listRef}
              className="flex min-w-0 flex-1 flex-col overflow-y-auto"
            >
              {books.length === 0 ? (
                <EmptyShelf onScan={scan} />
              ) : (
                <>
                  <div className="sticky top-0 z-10 flex items-center justify-between gap-2 bg-surface/95 px-4 pt-3 pb-1.5 text-[11px] font-semibold text-text-faint backdrop-blur md:pt-4 md:pb-2">
                    <span className="flex min-w-0 items-center gap-1">
                      <span className="truncate md:text-sm md:text-text">
                        {shelfName}
                      </span>
                      <span aria-hidden="true">·</span>
                      <label className="relative shrink-0">
                        <span className="sr-only">並び順</span>
                        <select
                          value={sort}
                          onChange={(event) =>
                            setSort(event.target.value as BookSort)
                          }
                          className="cursor-pointer appearance-none bg-transparent pr-1 font-semibold text-text-faint hover:text-text focus:outline-none"
                        >
                          {(Object.keys(SORT_LABEL) as BookSort[]).map(
                            (option) => (
                              <option key={option} value={option}>
                                {SORT_LABEL[option]}
                              </option>
                            ),
                          )}
                        </select>
                      </label>
                    </span>
                    <span className="shrink-0 font-normal tabular-nums">
                      {shown.length === onShelf.length
                        ? `${onShelf.length}冊`
                        : `${shown.length} / ${onShelf.length}冊`}
                    </span>
                  </div>
                  {shown.length === 0 ? (
                    <p className="px-4 py-12 text-center text-sm text-text-muted">
                      該当する本はありません
                    </p>
                  ) : view === "grid" ? (
                    <ul
                      ref={gridRef}
                      role="listbox"
                      aria-label="蔵書"
                      className="grid grid-cols-[repeat(auto-fill,minmax(7.5rem,1fr))] gap-x-3 gap-y-5 px-4 pt-1 pb-4 md:grid-cols-[repeat(auto-fill,minmax(9rem,1fr))] md:gap-x-4"
                    >
                      {shown.map((book, index) => (
                        <li
                          key={book.id}
                          className="lib-row"
                          style={{ "--i": index } as React.CSSProperties}
                          ref={rowRef(book.id)}
                        >
                          <BookCard
                            book={book}
                            selected={index === selectedIndex}
                            onClick={() => open(book)}
                          />
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <ul
                      role="listbox"
                      aria-label="蔵書"
                      className="px-2 pb-2 md:px-3"
                    >
                      {shown.map((book, index) => (
                        <li
                          key={book.id}
                          className="lib-row"
                          style={{ "--i": index } as React.CSSProperties}
                          ref={rowRef(book.id)}
                        >
                          <BookRow
                            book={book}
                            selected={index === selectedIndex}
                            onClick={() => open(book)}
                          />
                        </li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>

            <aside className="hidden w-[22rem] shrink-0 overflow-y-auto border-l border-border xl:block">
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
            {panel && (
              <ActionPanel
                actions={
                  panel === "shelves"
                    ? actions.filter((action) => action.section === "場所")
                    : actions
                }
                title={panel === "shelves" ? "場所" : undefined}
                onClose={() => setPanel(null)}
              />
            )}
            {/* The desktop's status bar; a phone has the tab bar below. */}
            <div className="hidden md:block">
              <WindowFooter
                left={
                  refreshAllProgress && (
                    <>
                      <Spinner />
                      <span className="truncate" aria-live="polite">
                        書誌を再取得中 {refreshAllProgress.done}/
                        {refreshAllProgress.total}
                      </span>
                    </>
                  )
                }
              >
                {selected && (
                  <IconButton
                    label="編集"
                    keys={["⌘", "E"]}
                    onClick={() => setEditing(selected)}
                  >
                    <PencilIcon className={ICON} />
                  </IconButton>
                )}
                <IconButton
                  label="アクション"
                  keys={["⌘", "K"]}
                  onClick={() => setPanel((open) => (open ? null : "all"))}
                >
                  <MoreIcon className={ICON} />
                </IconButton>
              </WindowFooter>
            </div>
            <TabBar
              shelfName={location === undefined ? null : shelfName}
              panel={panel}
              refreshProgress={refreshAllProgress}
              onHome={() => {
                setShelf(undefined);
                setQuery("");
                listRef.current?.scrollTo({ top: 0, behavior: "smooth" });
              }}
              onShelves={() => setPanel("shelves")}
              onScan={scan}
              onManual={() => setEditing("new")}
              onMore={() => setPanel("all")}
            />
          </div>
        </div>
      </div>

      {/* The detail stays mounted under the edit page rather than
          stepping aside for it: they are a stack, and back (or ✕) on
          the edit page should reveal the detail it was opened from, not
          re-open it as a new page with a new history entry. */}
      {viewing && (
        <DetailSheet
          book={viewing}
          covered={Boolean(editing)}
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
 */
function BookRow({
  book,
  selected,
  onClick,
}: {
  book: ShelvedBook;
  selected: boolean;
  onClick: () => void;
}) {
  const line = imprint(book);
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
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

/** One grid item: the cover large, the title and author under it. */
function BookCard({
  book,
  selected,
  onClick,
}: {
  book: ShelvedBook;
  selected: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      role="option"
      aria-selected={selected}
      onClick={onClick}
      className="lib-select group flex w-full flex-col gap-2 text-left"
    >
      <BookCover
        title={book.title}
        isbn={book.isbn}
        coverUrl={book.cover_url}
        size="fill"
        className={`shadow-[0_8px_24px_rgba(0,0,0,0.45)] transition-[transform,box-shadow] group-hover:-translate-y-0.5 ${
          selected ? "ring-2 ring-accent ring-offset-2 ring-offset-surface" : ""
        }`}
      />
      <span className="min-w-0 px-0.5">
        <span className="line-clamp-2 text-sm leading-snug text-text">
          {book.title}
        </span>
        {book.authors && (
          <span className="mt-0.5 block truncate text-xs text-text-muted">
            {book.authors}
          </span>
        )}
      </span>
    </button>
  );
}

/**
 * The phone's tab bar, laid out like a wallet app's: two tabs either
 * side of one large round button that stands above the bar — scanning,
 * the thing this app is mostly opened to do. Each tab is an icon with
 * its name under it; the one in use is lit in the accent.
 */
function TabBar({
  shelfName,
  panel,
  refreshProgress,
  onHome,
  onShelves,
  onScan,
  onManual,
  onMore,
}: {
  /** The shelf being shown, or null for all of them. */
  shelfName: string | null;
  panel: "all" | "shelves" | null;
  refreshProgress: { done: number; total: number } | null;
  onHome: () => void;
  onShelves: () => void;
  onScan: () => void;
  onManual: () => void;
  onMore: () => void;
}) {
  const tab = (active: boolean) =>
    `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 pt-2 pb-1 text-[11px] transition-colors active:scale-[0.94] ${
      active ? "text-accent" : "text-text-muted"
    }`;
  return (
    <nav
      aria-label="メニュー"
      className="relative shrink-0 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] md:hidden"
    >
      {refreshProgress && (
        <p
          aria-live="polite"
          className="flex items-center justify-center gap-2 border-b border-border py-1.5 text-xs text-text-muted"
        >
          <Spinner />
          書誌を再取得中 {refreshProgress.done}/{refreshProgress.total}
        </p>
      )}
      <div className="flex h-16 items-stretch">
        <button
          type="button"
          onClick={onHome}
          aria-current={shelfName === null && !panel ? "page" : undefined}
          className={tab(shelfName === null && !panel)}
        >
          <BookIcon className="h-6 w-6" />
          本棚
        </button>
        <button
          type="button"
          onClick={onShelves}
          className={tab(shelfName !== null || panel === "shelves")}
        >
          <PinIcon className="h-6 w-6" />
          <span className="max-w-full truncate px-1">
            {shelfName ?? "場所"}
          </span>
        </button>

        {/* The room the round button stands in. */}
        <div className="relative w-[5.5rem] shrink-0">
          <button
            type="button"
            onClick={onScan}
            aria-label="スキャンして追加"
            className="absolute -top-6 left-1/2 flex h-[4.75rem] w-[4.75rem] -translate-x-1/2 flex-col items-center justify-center gap-0.5 rounded-full bg-accent text-[11px] font-semibold text-inverse shadow-[0_8px_24px_var(--accent-soft),0_0_0_4px_var(--surface)] transition-transform active:scale-[0.94]"
          >
            <BarcodeIcon className="h-7 w-7" />
            スキャン
          </button>
        </div>

        <button type="button" onClick={onManual} className={tab(false)}>
          <PlusIcon className="h-6 w-6" />
          手入力
        </button>
        <button type="button" onClick={onMore} className={tab(panel === "all")}>
          <MoreIcon className="h-6 w-6" />
          その他
        </button>
      </div>
    </nav>
  );
}

/** List or grid: two icons side by side, the current one lit. */
function ViewToggle({
  view,
  onChange,
}: {
  view: View;
  onChange: (view: View) => void;
}) {
  const options: [View, string, React.ReactNode][] = [
    ["list", "リスト表示", <ListIcon key="list" className={ICON} />],
    ["grid", "グリッド表示", <GridIcon key="grid" className={ICON} />],
  ];
  return (
    <div
      role="radiogroup"
      aria-label="表示"
      className="flex shrink-0 rounded-xl bg-bg/60 p-0.5 sm:rounded-lg"
    >
      {options.map(([value, label, icon]) => (
        <button
          key={value}
          type="button"
          role="radio"
          aria-checked={view === value}
          aria-label={label}
          title={label}
          onClick={() => onChange(value)}
          className={`flex h-10 w-10 items-center justify-center rounded-[10px] transition-colors sm:h-7 sm:w-7 sm:rounded-md ${
            view === value
              ? "bg-surface-hover text-text"
              : "text-text-faint hover:text-text"
          }`}
        >
          {icon}
        </button>
      ))}
    </div>
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
  onZoomChange,
}: {
  book: ShelvedBook;
  refreshing: boolean;
  onEdit: () => void;
  onRefresh: () => void;
  compact?: boolean;
  /** Told when the cover viewer opens and closes, so a sheet under it
   *  can leave Escape to it. */
  onZoomChange?: (open: boolean) => void;
}) {
  const rows: [string, string | null][] = [
    ["著者", book.authors],
    ["出版社", book.publisher],
    ["発売", book.published],
    ["価格", book.price == null ? null : `¥${yen.format(book.price)}`],
    ["ISBN", book.isbn ? formatIsbn(book.isbn) : null],
    ["場所", book.location],
  ];
  // The cover, opened large: tap it to see it, tap anywhere to put it
  // away.
  const [zoomed, setZoomed] = useState<string | null>(null);

  return (
    <div className={`flex flex-col gap-4 ${compact ? "" : "p-5"}`}>
      <div className="flex items-start gap-4">
        <BookCover
          title={book.title}
          isbn={book.isbn}
          coverUrl={book.cover_url}
          size="lg"
          onZoom={(source) => {
            setZoomed(source);
            onZoomChange?.(true);
          }}
          className="shadow-[0_10px_30px_rgba(0,0,0,0.45)]"
        />
        {zoomed && (
          <CoverLightbox
            source={zoomed}
            title={book.title}
            onClose={() => {
              setZoomed(null);
              onZoomChange?.(false);
            }}
          />
        )}
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
        <IconButton label="編集" tone="outline" onClick={onEdit}>
          <PencilIcon className={ICON} />
        </IconButton>
        {book.isbn && missingDetails(book) && (
          <IconButton
            label="書誌を再取得（価格・表紙などを補完）"
            tone="outline"
            onClick={onRefresh}
            disabled={refreshing}
          >
            {refreshing ? <Spinner /> : <RefreshIcon className={ICON} />}
          </IconButton>
        )}
        {/* A link, not a button: it goes somewhere, and a middle click
            or a long press should offer what they do for any link. */}
        <a
          href={googleSearchUrl(book)}
          target="_blank"
          rel="noopener noreferrer"
          aria-label="Googleで検索"
          title="Googleで検索"
          className="flex h-11 shrink-0 items-center justify-center gap-1.5 rounded-xl border border-border px-3 text-sm text-text-muted transition-[transform,background-color,color] hover:bg-surface-hover hover:text-text active:scale-[0.92] sm:h-8 sm:rounded-lg sm:px-2.5 sm:text-xs"
        >
          <SearchIcon className={ICON} />
          Google
        </a>
      </div>

      {!compact && (
        <p className="flex items-center gap-1.5 text-[11px] text-text-faint">
          <Kbd>⌘</Kbd>
          <Kbd>E</Kbd> で編集 · <Kbd>⌘</Kbd>
          <Kbd>K</Kbd> でアクション
        </p>
      )}
    </div>
  );
}

/** The detail pane, as a sheet, for screens too narrow to show it. */
function DetailSheet({
  book,
  covered,
  refreshing,
  onClose,
  onEdit,
  onRefresh,
}: {
  book: ShelvedBook;
  /** Another page is on top of it; Escape belongs to that one. */
  covered: boolean;
  refreshing: boolean;
  onClose: () => void;
  onEdit: () => void;
  onRefresh: () => void;
}) {
  const [zoomed, setZoomed] = useState(false);
  useEscapeKey(onClose, !covered && !zoomed, { exclusive: true });
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
        onZoomChange={setZoomed}
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
      <p className="text-sm text-text-muted">まだ本が登録されていません</p>
      <IconButton
        label="スキャンして追加"
        tone="primary"
        onClick={onScan}
        className="!h-14 !w-14 !rounded-2xl"
      >
        <BarcodeIcon className="h-6 w-6" />
      </IconButton>
    </div>
  );
}
