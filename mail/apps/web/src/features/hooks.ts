"use client";
// データ取得・状態管理（表示コンポーネントから分離）
import type { DraftSummary, Page, ThreadDetail, ThreadSummary } from "@synedge/mail-core";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ErrorCode } from "@synedge/mail-core";
import { api, ApiError, errorMessage } from "./api";

export function useOnline(): boolean {
  return useSyncExternalStore(
    (cb) => {
      window.addEventListener("online", cb);
      window.addEventListener("offline", cb);
      return () => {
        window.removeEventListener("online", cb);
        window.removeEventListener("offline", cb);
      };
    },
    () => navigator.onLine,
    () => true,
  );
}

export interface PagedState<T> {
  items: T[];
  loading: boolean;
  loadingMore: boolean;
  refreshing: boolean;
  error: string | null;
  errorCode: ErrorCode | null;
  nextCursor: string | null;
}

/** カーソル型ページネーションの一覧。path が変わると先頭から読み直す */
export function usePagedList<T extends { id: string }>(path: string | null) {
  const [state, setState] = useState<PagedState<T>>({
    items: [],
    loading: !!path,
    loadingMore: false,
    refreshing: false,
    error: null,
    errorCode: null,
    nextCursor: null,
  });
  const reqId = useRef(0);

  const load = useCallback(
    async (mode: "initial" | "refresh" | "more", cursor?: string | null) => {
      if (!path) return;
      const id = ++reqId.current;
      setState((s) => ({
        ...s,
        loading: mode === "initial",
        refreshing: mode === "refresh",
        loadingMore: mode === "more",
        error: null,
        errorCode: null,
        ...(mode === "initial" ? { items: [], nextCursor: null } : {}),
      }));
      try {
        const url = new URL(path, window.location.origin);
        if (cursor) url.searchParams.set("cursor", cursor);
        const page = await api<Page<T>>(url.pathname + url.search);
        if (id !== reqId.current) return;
        setState((s) => ({
          items: mode === "more" ? [...s.items, ...page.items.filter((i) => !s.items.some((x) => x.id === i.id))] : page.items,
          nextCursor: page.nextCursor,
          loading: false,
          loadingMore: false,
          refreshing: false,
          error: null,
          errorCode: null,
        }));
      } catch (e) {
        if (id !== reqId.current) return;
        setState((s) => ({ ...s, loading: false, loadingMore: false, refreshing: false, error: errorMessage(e), errorCode: e instanceof ApiError ? e.code : "INTERNAL" }));
      }
    },
    [path],
  );

  useEffect(() => {
    void load("initial");
  }, [load]);

  return {
    ...state,
    refresh: () => load("refresh"),
    retry: () => load(state.items.length ? "refresh" : "initial"),
    loadMore: () => (state.nextCursor ? load("more", state.nextCursor) : Promise.resolve()),
    /** 楽観的更新（既読化・アーカイブ後の一覧反映） */
    update: (fn: (items: T[]) => T[]) => setState((s) => ({ ...s, items: fn(s.items) })),
  };
}

export function useThreadList(folder: "inbox" | "search", query: string) {
  const path = folder === "search" ? (query.trim() ? `/api/mail/search?q=${encodeURIComponent(query.trim())}` : null) : "/api/mail/threads";
  return usePagedList<ThreadSummary>(path);
}

export function useDraftList(enabled: boolean) {
  return usePagedList<DraftSummary>(enabled ? "/api/mail/drafts" : null);
}

export function useThread(threadId: string | null) {
  const [thread, setThread] = useState<ThreadDetail | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [allowImages, setAllowImages] = useState(false);
  const reqId = useRef(0);

  const load = useCallback(async () => {
    if (!threadId) {
      setThread(null);
      return;
    }
    const id = ++reqId.current;
    setLoading(true);
    setError(null);
    try {
      const t = await api<ThreadDetail>(`/api/mail/threads/${encodeURIComponent(threadId)}${allowImages ? "?images=1" : ""}`);
      if (id === reqId.current) setThread(t);
    } catch (e) {
      if (id === reqId.current) {
        setThread(null);
        setError(errorMessage(e));
      }
    } finally {
      if (id === reqId.current) setLoading(false);
    }
  }, [threadId, allowImages]);

  useEffect(() => {
    setAllowImages(false);
  }, [threadId]);

  useEffect(() => {
    void load();
  }, [load]);

  return { thread, setThread, loading, error, reload: load, allowImages, showImages: () => setAllowImages(true) };
}
