"use client";
// メール画面の組み立て。データ取得は features/、見た目は @/mail/ui に分け、ここは配線だけを行う。
import { webPath, type SendResult } from "@/mail/core";
import {
  Banner,
  ComposeFab,
  ComposeForm,
  DraftList,
  EmptyState,
  ErrorState,
  IconButton,
  IconRefresh,
  IconSearch,
  IconSettings,
  MailLayout,
  NavMenu,
  SendConfirmDialog,
  Spinner,
  ThreadList,
  ThreadView,
  cx,
  type Folder,
} from "@/mail/ui";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { api, errorMessage } from "@/mail/client/api";
import { useCompose } from "@/mail/client/compose";
import { useDraftList, useOnline, useThread, useThreadList } from "@/mail/client/hooks";
import { useShortcuts } from "@/mail/client/shortcuts";

type View = Folder | "search";

const AUTO_REFRESH_MS = 60_000;

export function MailApp({ accountEmail }: { accountEmail: string }) {
  const router = useRouter();
  const params = useSearchParams();
  const view: View = params.get("f") === "drafts" ? "drafts" : params.get("q") ? "search" : "inbox";
  const query = params.get("q") ?? "";
  const threadId = params.get("thread");
  const online = useOnline();

  const list = useThreadList(view === "search" ? "search" : "inbox", query);
  const drafts = useDraftList(view === "drafts");
  const detail = useThread(threadId);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busy, setBusy] = useState<"read" | "archive" | null>(null);
  const [searchText, setSearchText] = useState(query);
  const searchRef = useRef<HTMLInputElement>(null);

  const go = useCallback(
    (next: { f?: View; q?: string; thread?: string | null }, mode: "push" | "replace" = "push") => {
      const sp = new URLSearchParams();
      const f = next.f ?? view;
      if (f === "drafts") sp.set("f", "drafts");
      const q = next.q ?? (f === "search" ? query : "");
      if (f === "search" && q) sp.set("q", q);
      const t = next.thread === undefined ? threadId : next.thread;
      if (t) sp.set("thread", t);
      const url = webPath(`/${sp.size ? `?${sp}` : ""}`);
      if (mode === "push") router.push(url, { scroll: false });
      else router.replace(url, { scroll: false });
    },
    [router, view, query, threadId],
  );

  // 送信完了後の処理は毎回最新の状態を参照する
  const afterSent = useRef<() => void>(() => {});
  const onSent = useCallback((_r: SendResult) => {
    setTimeout(() => afterSent.current(), 1200);
  }, []);
  const compose = useCompose(onSent);
  useEffect(() => {
    afterSent.current = () => {
      compose.close();
      void list.refresh();
      if (threadId) void detail.reload();
      if (view === "drafts") void drafts.refresh();
    };
  });

  // 開いたスレッドが未読なら既読にする（Gmail側にも反映）
  const markedRef = useRef<string | null>(null);
  useEffect(() => {
    const t = detail.thread;
    if (!t || markedRef.current === t.id || !t.messages.some((m) => m.unread)) return;
    markedRef.current = t.id;
    void api(`/api/mail/threads/${encodeURIComponent(t.id)}/read`, { method: "POST" })
      .then(() => {
        list.update((items) => items.map((i) => (i.id === t.id ? { ...i, unread: false } : i)));
        detail.setThread((cur) => (cur && cur.id === t.id ? { ...cur, messages: cur.messages.map((m) => ({ ...m, unread: false })) } : cur));
      })
      .catch((e) => setActionError(errorMessage(e)));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [detail.thread]);

  // 画面復帰時と定期的に一覧を更新する
  useEffect(() => {
    const refresh = () => {
      if (document.visibilityState === "visible" && navigator.onLine) void list.refresh();
    };
    const timer = setInterval(refresh, AUTO_REFRESH_MS);
    document.addEventListener("visibilitychange", refresh);
    window.addEventListener("online", refresh);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", refresh);
      window.removeEventListener("online", refresh);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, query]);

  const toggleRead = useCallback(
    async (markRead: boolean) => {
      const t = detail.thread;
      if (!t) return;
      setBusy("read");
      try {
        await api(`/api/mail/threads/${encodeURIComponent(t.id)}/${markRead ? "read" : "unread"}`, { method: "POST" });
        list.update((items) => items.map((i) => (i.id === t.id ? { ...i, unread: !markRead } : i)));
        detail.setThread({ ...t, messages: t.messages.map((m, idx) => ({ ...m, unread: markRead ? false : idx === t.messages.length - 1 || m.unread })) });
        markedRef.current = t.id;
      } catch (e) {
        setActionError(errorMessage(e));
      } finally {
        setBusy(null);
      }
    },
    [detail, list],
  );

  const archive = useCallback(async () => {
    const t = detail.thread;
    if (!t) return;
    setBusy("archive");
    const idx = list.items.findIndex((i) => i.id === t.id);
    try {
      await api(`/api/mail/threads/${encodeURIComponent(t.id)}/archive`, { method: "POST" });
      list.update((items) => items.filter((i) => i.id !== t.id));
      const next = list.items[idx + 1] ?? list.items[idx - 1];
      // PCでは次のスレッドへ、スマホでは一覧へ戻る
      const wide = window.matchMedia("(min-width: 768px)").matches;
      go({ thread: wide && next && next.id !== t.id ? next.id : null }, "replace");
    } catch (e) {
      setActionError(errorMessage(e));
    } finally {
      setBusy(null);
    }
  }, [detail.thread, list, go]);

  const moveSelection = useCallback(
    (delta: number) => {
      const items = list.items;
      if (!items.length) return;
      const idx = items.findIndex((i) => i.id === threadId);
      const next = items[Math.min(items.length - 1, Math.max(0, idx + delta))];
      if (next) go({ thread: next.id }, "replace");
    },
    [list.items, threadId, go],
  );

  useShortcuts(
    {
      j: () => moveSelection(1),
      k: () => moveSelection(-1),
      e: () => void archive(),
      r: () => {
        const m = detail.thread?.messages.at(-1);
        if (m) void compose.start({ kind: "reply", messageId: m.id, mode: "reply" });
      },
      a: () => {
        const m = detail.thread?.messages.at(-1);
        if (m) void compose.start({ kind: "reply", messageId: m.id, mode: "replyAll" });
      },
      U: () => detail.thread && void toggleRead(!detail.thread.messages.some((m) => m.unread)),
      c: () => void compose.start({ kind: "new" }),
      "/": () => searchRef.current?.focus(),
      Escape: () => threadId && go({ thread: null }),
    },
    !compose.open,
  );

  const reauth = list.errorCode === "REAUTH_REQUIRED" || list.errorCode === "INSUFFICIENT_SCOPE" || list.errorCode === "NOT_CONNECTED";
  const folderTitle = view === "drafts" ? "下書き" : view === "search" ? `検索: ${query}` : "受信トレイ";

  const listHeader = (
    <div className="border-b border-border">
      <div className="flex items-center gap-1 px-2 pt-2">
        <h2 className="min-w-0 flex-1 truncate px-2 text-base font-semibold text-text">{folderTitle}</h2>
        <IconButton label="更新" onClick={() => (view === "drafts" ? drafts.refresh() : list.refresh())}>
          {list.refreshing || drafts.refreshing ? <Spinner size={18} /> : <IconRefresh />}
        </IconButton>
        <a href={webPath("/settings")} aria-label="設定" title="設定" className="inline-flex size-touch items-center justify-center rounded-md text-text hover:bg-surface-2 lg:hidden">
          <IconSettings />
        </a>
      </div>
      <form
        role="search"
        className="flex items-center gap-2 px-3 py-2"
        onSubmit={(e) => {
          e.preventDefault();
          const q = searchText.trim();
          go(q ? { f: "search", q, thread: null } : { f: "inbox", q: "", thread: null });
        }}
      >
        <label className="flex min-h-touch flex-1 items-center gap-2 rounded-md bg-surface-2 px-3">
          <IconSearch size={16} className="text-muted" />
          <span className="sr-only">メールを検索</span>
          <input
            ref={searchRef}
            type="search"
            enterKeyHint="search"
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="検索（from: subject: などGmailの演算子が使えます）"
            className="w-full bg-transparent text-sm text-text outline-none placeholder:text-muted"
            maxLength={500}
          />
        </label>
      </form>
      <div className="flex gap-1 px-3 pb-2 lg:hidden" role="tablist" aria-label="フォルダ">
        {(["inbox", "drafts"] as const).map((f) => (
          <button
            key={f}
            role="tab"
            aria-selected={view === f}
            onClick={() => {
              setSearchText("");
              go({ f, q: "", thread: null });
            }}
            className={cx("min-h-9 rounded-full px-4 text-sm", view === f ? "bg-selected font-semibold text-text" : "text-muted")}
          >
            {f === "inbox" ? "受信トレイ" : "下書き"}
          </button>
        ))}
      </div>
    </div>
  );

  const listPane = (
    <div className="flex h-full min-h-0 flex-col">
      {listHeader}
      {!online && <Banner kind="offline">オフラインです。接続が戻ると自動で更新します。</Banner>}
      {reauth && (
        <Banner kind="warning" action={{ label: "再接続", onClick: () => window.location.assign(webPath("/settings")) }}>
          {list.error}
        </Banner>
      )}
      {list.error && !reauth && list.items.length > 0 && (
        <Banner kind="error" action={{ label: "再試行", onClick: () => void list.retry() }}>
          {list.error}
        </Banner>
      )}
      {actionError && (
        <Banner kind="error" action={{ label: "閉じる", onClick: () => setActionError(null) }}>
          {actionError}
        </Banner>
      )}
      <div className="min-h-0 flex-1 overflow-y-auto pb-20 md:pb-0">
        {view === "drafts" ? (
          <DraftList
            drafts={drafts.items}
            loading={drafts.loading}
            error={drafts.error}
            onRetry={() => void drafts.retry()}
            onOpen={(id) => void compose.start({ kind: "draft", draftId: id })}
          />
        ) : (
          <ThreadList
            label={folderTitle}
            threads={list.items}
            selectedId={threadId}
            onSelect={(id) => go({ thread: id })}
            loading={list.loading}
            error={reauth ? null : list.error}
            onRetry={() => void list.retry()}
            hasMore={!!list.nextCursor}
            loadingMore={list.loadingMore}
            onLoadMore={() => void list.loadMore()}
            emptyTitle={view === "search" ? "該当するメールはありません" : "受信トレイは空です"}
            emptyDescription={view === "search" ? "検索語を変えてお試しください。" : undefined}
          />
        )}
      </div>
    </div>
  );

  const detailPane = useMemo(() => {
    if (!threadId) return <EmptyState title="メールを選択してください" description="j / k で移動、e でアーカイブ、r で返信、c で新規作成" />;
    if (detail.loading && !detail.thread) {
      return (
        <div className="flex h-full items-center justify-center">
          <Spinner label="読み込み中" />
        </div>
      );
    }
    if (detail.error || !detail.thread) {
      return (
        <div className="flex h-full flex-col">
          <div className="p-2 md:hidden">
            <button type="button" className="min-h-touch px-2 text-sm text-accent" onClick={() => go({ thread: null })}>
              ← 一覧に戻る
            </button>
          </div>
          <ErrorState message={detail.error ?? "メールを表示できません"} onRetry={() => void detail.reload()} />
        </div>
      );
    }
    return (
      <ThreadView
        thread={detail.thread}
        onBack={() => (window.history.length > 1 ? router.back() : go({ thread: null }, "replace"))}
        onReply={(messageId, mode) => void compose.start({ kind: "reply", messageId, mode })}
        onToggleRead={(read) => void toggleRead(read)}
        onArchive={() => void archive()}
        onShowImages={detail.showImages}
        remoteImagesAllowed={detail.allowImages}
        busy={busy}
      />
    );
  }, [threadId, detail, busy, compose, toggleRead, archive, go, router]);

  const overlay = compose.open ? (
    <>
      <div
        className={cx(
          "fixed inset-0 z-40 flex flex-col overflow-hidden bg-surface shadow-2xl",
          "md:inset-auto md:right-4 md:bottom-4 md:h-[min(85dvh,760px)] md:w-[min(44rem,calc(100vw-2rem))] md:rounded-lg md:border md:border-border",
        )}
      >
        {compose.loadingInit ? (
          <div className="flex h-full items-center justify-center">
            <Spinner label="読み込み中" />
          </div>
        ) : (
          <ComposeForm
            title={compose.title}
            value={compose.value}
            onChange={compose.change}
            status={compose.status}
            fieldErrors={compose.fieldErrors}
            onSaveDraft={() => void compose.saveDraft()}
            onRequestSend={compose.requestSend}
            onClose={compose.close}
            onCheckStatus={() => void compose.checkStatus()}
            showCcBcc={compose.showCcBcc}
            onToggleCcBcc={compose.toggleCcBcc}
          />
        )}
        {compose.status.kind === "unknown" && (
          <div className="border-t border-border p-3 text-xs text-muted">
            Gmail の送信済みに無いことを確認した場合のみ、
            <button type="button" className="text-accent underline" onClick={compose.resetForResend}>
              送り直せる状態に戻す
            </button>
            。
          </div>
        )}
      </div>
      {(compose.status.kind === "confirming" || compose.status.kind === "sending") && (
        <SendConfirmDialog
          value={compose.value}
          sending={compose.status.kind === "sending"}
          onConfirm={() => void compose.confirmSend()}
          onCancel={compose.cancelConfirm}
        />
      )}
    </>
  ) : null;

  return (
    <>
      <MailLayout
        nav={
          <NavMenu
            folder={view}
            onFolder={(f) => {
              setSearchText("");
              go({ f, q: "", thread: null });
            }}
            onCompose={() => void compose.start({ kind: "new" })}
            settingsHref={webPath("/settings")}
            accountEmail={accountEmail}
          />
        }
        list={listPane}
        detail={detailPane}
        showDetailOnMobile={!!threadId}
        overlay={overlay}
      />
      {!threadId && !compose.open && <ComposeFab onClick={() => void compose.start({ kind: "new" })} />}
    </>
  );
}
