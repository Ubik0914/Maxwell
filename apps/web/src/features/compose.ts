"use client";
// 作成・返信・下書き・送信の状態管理。送信は確認ダイアログを経た明示操作のみ。
import {
  draftInputSchema,
  formatAddress,
  parseAddressList,
  sendInputSchema,
  type DraftDetail,
  type SendResult,
} from "@synedge/mail-core";
import type { ComposeStatus, ComposeValue } from "@synedge/ui";
import { useCallback, useRef, useState } from "react";
import { api, ApiError, errorMessage } from "./api";

export type ComposeInit =
  | { kind: "new" }
  | { kind: "reply"; messageId: string; mode: "reply" | "replyAll" }
  | { kind: "draft"; draftId: string };

interface ReplyDraftResponse {
  to: string[];
  cc: string[];
  subject: string;
  threadId: string;
  replyToMessageId: string;
  quotedOriginal: string;
}

export function splitRecipients(value: string): string[] {
  return parseAddressList(value).map(formatAddress);
}

const EMPTY: ComposeValue = { to: "", cc: "", bcc: "", subject: "", body: "" };

function newKey(): string {
  return crypto.randomUUID();
}

export function useCompose(onSent: (r: SendResult) => void) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState("新規メッセージ");
  const [value, setValue] = useState<ComposeValue>(EMPTY);
  const [status, setStatus] = useState<ComposeStatus>({ kind: "idle" });
  const [fieldErrors, setFieldErrors] = useState<Partial<Record<keyof ComposeValue, string>>>({});
  const [showCcBcc, setShowCcBcc] = useState(false);
  const [loadingInit, setLoadingInit] = useState(false);
  const meta = useRef<{ draftId?: string; threadId?: string; replyToMessageId?: string; key: string }>({ key: newKey() });
  const sendingRef = useRef(false);

  const start = useCallback(async (init: ComposeInit) => {
    meta.current = { key: newKey() };
    setFieldErrors({});
    setStatus({ kind: "idle" });
    setValue(EMPTY);
    setShowCcBcc(false);
    setOpen(true);
    if (init.kind === "new") {
      setTitle("新規メッセージ");
      return;
    }
    setLoadingInit(true);
    try {
      if (init.kind === "reply") {
        setTitle(init.mode === "replyAll" ? "全員に返信" : "返信");
        const r = await api<ReplyDraftResponse>(`/api/mail/messages/${encodeURIComponent(init.messageId)}/reply?mode=${init.mode}`);
        meta.current = { ...meta.current, threadId: r.threadId, replyToMessageId: r.replyToMessageId };
        setValue({ to: r.to.join(", "), cc: r.cc.join(", "), bcc: "", subject: r.subject, body: r.quotedOriginal ? `\n\n${r.quotedOriginal}` : "" });
        setShowCcBcc(r.cc.length > 0);
      } else {
        setTitle("下書きを編集");
        const d = await api<DraftDetail>(`/api/mail/drafts/${encodeURIComponent(init.draftId)}`);
        meta.current = {
          ...meta.current,
          draftId: d.id,
          threadId: d.threadId ?? undefined,
          replyToMessageId: d.replyToMessageId ?? undefined,
        };
        setValue({ to: d.to.join(", "), cc: d.cc.join(", "), bcc: d.bcc.join(", "), subject: d.subject, body: d.body });
        setShowCcBcc(d.cc.length > 0 || d.bcc.length > 0);
      }
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e) });
    } finally {
      setLoadingInit(false);
    }
  }, []);

  const payload = useCallback(
    () => ({
      to: splitRecipients(value.to),
      cc: splitRecipients(value.cc),
      bcc: splitRecipients(value.bcc),
      subject: value.subject,
      body: value.body,
      threadId: meta.current.threadId,
      replyToMessageId: meta.current.replyToMessageId,
    }),
    [value],
  );

  const change = useCallback((patch: Partial<ComposeValue>) => {
    setValue((v) => ({ ...v, ...patch }));
    setFieldErrors((f) => {
      const next = { ...f };
      for (const k of Object.keys(patch) as (keyof ComposeValue)[]) delete next[k];
      return next;
    });
    setStatus((s) => (s.kind === "saved" || s.kind === "error" ? { kind: "idle" } : s));
  }, []);

  const saveDraft = useCallback(async () => {
    const p = payload();
    const parsed = draftInputSchema.safeParse(p);
    if (!parsed.success) {
      setStatus({ kind: "error", message: parsed.error.issues[0]?.message ?? "入力内容に誤りがあります" });
      return;
    }
    setStatus({ kind: "saving" });
    try {
      if (meta.current.draftId) {
        await api(`/api/mail/drafts/${encodeURIComponent(meta.current.draftId)}`, { method: "PATCH", body: p });
      } else {
        const r = await api<{ draftId: string }>("/api/mail/drafts", { method: "POST", body: p });
        meta.current.draftId = r.draftId;
      }
      setStatus({ kind: "saved", at: new Date().toLocaleTimeString("ja-JP", { hour: "2-digit", minute: "2-digit" }) });
    } catch (e) {
      setStatus({ kind: "error", message: errorMessage(e) });
    }
  }, [payload]);

  /** 送信前の検証。問題がなければ確認ダイアログへ */
  const requestSend = useCallback(() => {
    const r = sendInputSchema.safeParse({ ...payload(), draftId: meta.current.draftId, idempotencyKey: meta.current.key });
    if (!r.success) {
      const errs: Partial<Record<keyof ComposeValue, string>> = {};
      for (const issue of r.error.issues) {
        const field = issue.path[0];
        if (field === "to" || field === "cc" || field === "bcc" || field === "subject" || field === "body") {
          errs[field] ??= issue.message;
        }
      }
      setFieldErrors(errs);
      if (!Object.keys(errs).length) setStatus({ kind: "error", message: r.error.issues[0]?.message ?? "入力内容に誤りがあります" });
      return;
    }
    setStatus({ kind: "confirming" });
  }, [payload]);

  const confirmSend = useCallback(async () => {
    // 連打・再描画による二重実行を防ぐ（サーバー側でも冪等キーで防止）
    if (sendingRef.current) return;
    sendingRef.current = true;
    setStatus({ kind: "sending" });
    try {
      const r = await api<SendResult>("/api/mail/send", {
        method: "POST",
        body: { ...payload(), draftId: meta.current.draftId, idempotencyKey: meta.current.key },
      });
      setStatus({ kind: "sent" });
      onSent(r);
    } catch (e) {
      if (e instanceof ApiError && (e.code === "SEND_STATUS_UNKNOWN" || e.code === "SEND_IN_PROGRESS" || e.code === "NETWORK" || e.code === "TIMEOUT")) {
        // 結果不明：同じキーを保ったまま、状態確認だけを許す（自動再送しない）
        setStatus({ kind: "unknown", message: e.code === "SEND_IN_PROGRESS" ? e.message : "送信できたか確認できませんでした。二重送信を防ぐため自動では再送しません。" });
      } else {
        // 確定的な失敗：次の送信は新しいキーで行う
        meta.current.key = newKey();
        setStatus({ kind: "error", message: errorMessage(e) });
      }
    } finally {
      sendingRef.current = false;
    }
  }, [payload, onSent]);

  const checkStatus = useCallback(async () => {
    try {
      const r = await api<SendResult>(`/api/mail/send/${meta.current.key}`);
      if (r.status === "sent") {
        setStatus({ kind: "sent" });
        onSent(r);
      } else if (r.status === "failed") {
        meta.current.key = newKey();
        setStatus({ kind: "error", message: "送信されていませんでした。内容を確認して再度送信してください。" });
      } else {
        setStatus({
          kind: "unknown",
          message: "まだ送信済みを確認できません。少し待って再確認するか、Gmailの送信済みを確認してください。",
        });
      }
    } catch (e) {
      setStatus({ kind: "unknown", message: errorMessage(e) });
    }
  }, [onSent]);

  /** 結果不明のまま、利用者が「送信されていない」と判断して送り直す場合 */
  const resetForResend = useCallback(() => {
    meta.current.key = newKey();
    setStatus({ kind: "idle" });
  }, []);

  return {
    open,
    title,
    value,
    status,
    fieldErrors,
    showCcBcc,
    loadingInit,
    start,
    change,
    saveDraft,
    requestSend,
    confirmSend,
    cancelConfirm: () => setStatus({ kind: "idle" }),
    checkStatus,
    resetForResend,
    toggleCcBcc: () => setShowCcBcc(true),
    close: () => setOpen(false),
  };
}
