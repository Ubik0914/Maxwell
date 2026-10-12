import { useId, type ReactNode } from "react";
import { cx } from "./format";
import { IconClose } from "./icons";
import { Banner, Button, IconButton } from "./primitives";

export interface ComposeValue {
  to: string;
  cc: string;
  bcc: string;
  subject: string;
  body: string;
}

export type ComposeStatus =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "confirming" }
  | { kind: "sending" }
  | { kind: "sent" }
  | { kind: "error"; message: string }
  | { kind: "unknown"; message: string };

export interface ComposeFormProps {
  title: string;
  value: ComposeValue;
  onChange: (patch: Partial<ComposeValue>) => void;
  status: ComposeStatus;
  fieldErrors?: Partial<Record<keyof ComposeValue, string>>;
  onSaveDraft: () => void;
  onRequestSend: () => void;
  onClose: () => void;
  /** 送信状態が不明なときの再確認 */
  onCheckStatus?: () => void;
  showCcBcc: boolean;
  onToggleCcBcc: () => void;
}

function Field({
  label,
  error,
  children,
  id,
}: {
  label: string;
  error?: string;
  children: ReactNode;
  id: string;
}) {
  return (
    <div className="flex flex-col border-b border-border">
      <div className="flex items-center gap-2 px-4">
        <label htmlFor={id} className="w-12 shrink-0 text-sm text-muted">
          {label}
        </label>
        {children}
      </div>
      {error && (
        <p id={`${id}-error`} className="px-4 pb-1 text-xs text-danger">
          {error}
        </p>
      )}
    </div>
  );
}

const inputClass = "min-h-touch w-full min-w-0 bg-transparent text-sm text-text outline-none placeholder:text-muted";

export function ComposeForm(p: ComposeFormProps) {
  const id = useId();
  const busy = p.status.kind === "sending" || p.status.kind === "saving";
  const locked = p.status.kind === "sending" || p.status.kind === "sent";
  return (
    <form
      className="flex h-full min-h-0 flex-col bg-surface"
      aria-label={p.title}
      onSubmit={(e) => {
        e.preventDefault();
        if (!busy) p.onRequestSend();
      }}
    >
      <header className="flex items-center gap-2 border-b border-border px-2 py-1">
        <IconButton label="閉じる" onClick={p.onClose} disabled={p.status.kind === "sending"}>
          <IconClose />
        </IconButton>
        <h2 className="flex-1 text-sm font-semibold text-text">{p.title}</h2>
        <Button variant="ghost" onClick={p.onSaveDraft} loading={p.status.kind === "saving"} disabled={locked}>
          下書き保存
        </Button>
        <Button type="submit" variant="primary" disabled={busy || locked}>
          送信…
        </Button>
      </header>
      <StatusLine status={p.status} onCheckStatus={p.onCheckStatus} />
      <fieldset disabled={locked} className="flex min-h-0 flex-1 flex-col">
        <Field label="宛先" id={`${id}-to`} error={p.fieldErrors?.to}>
          <input
            id={`${id}-to`}
            className={inputClass}
            value={p.value.to}
            onChange={(e) => p.onChange({ to: e.target.value })}
            placeholder="name@example.com（複数はカンマ区切り）"
            inputMode="email"
            autoComplete="email"
            aria-invalid={!!p.fieldErrors?.to}
            aria-describedby={p.fieldErrors?.to ? `${id}-to-error` : undefined}
          />
          {!p.showCcBcc && (
            <button type="button" className="shrink-0 text-xs text-accent" onClick={p.onToggleCcBcc}>
              Cc/Bcc
            </button>
          )}
        </Field>
        {p.showCcBcc && (
          <>
            <Field label="Cc" id={`${id}-cc`} error={p.fieldErrors?.cc}>
              <input id={`${id}-cc`} className={inputClass} value={p.value.cc} onChange={(e) => p.onChange({ cc: e.target.value })} inputMode="email" />
            </Field>
            <Field label="Bcc" id={`${id}-bcc`} error={p.fieldErrors?.bcc}>
              <input id={`${id}-bcc`} className={inputClass} value={p.value.bcc} onChange={(e) => p.onChange({ bcc: e.target.value })} inputMode="email" />
            </Field>
          </>
        )}
        <Field label="件名" id={`${id}-subject`} error={p.fieldErrors?.subject}>
          <input
            id={`${id}-subject`}
            className={inputClass}
            value={p.value.subject}
            onChange={(e) => p.onChange({ subject: e.target.value })}
            aria-invalid={!!p.fieldErrors?.subject}
          />
        </Field>
        <label htmlFor={`${id}-body`} className="sr-only">
          本文
        </label>
        <textarea
          id={`${id}-body`}
          className="min-h-48 w-full flex-1 resize-none bg-transparent px-4 py-3 text-sm leading-relaxed text-text outline-none"
          value={p.value.body}
          onChange={(e) => p.onChange({ body: e.target.value })}
          aria-invalid={!!p.fieldErrors?.body}
        />
        {p.fieldErrors?.body && <p className="px-4 pb-2 text-xs text-danger">{p.fieldErrors.body}</p>}
      </fieldset>
    </form>
  );
}

function StatusLine({ status, onCheckStatus }: { status: ComposeStatus; onCheckStatus?: () => void }) {
  switch (status.kind) {
    case "sending":
      return <Banner kind="syncing">送信中です。画面を閉じずにお待ちください…</Banner>;
    case "sent":
      return <Banner kind="success">送信しました。</Banner>;
    case "saved":
      return <Banner kind="info">下書きを保存しました（{status.at}）。</Banner>;
    case "error":
      return <Banner kind="error">{status.message}</Banner>;
    case "unknown":
      return (
        <Banner kind="warning" action={onCheckStatus ? { label: "送信済みか確認", onClick: onCheckStatus } : undefined}>
          {status.message}
        </Banner>
      );
    default:
      return null;
  }
}

export interface SendConfirmProps {
  value: ComposeValue;
  sending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}

/** 送信前確認（仕様2章8：宛先・CC/BCC・件名・本文を確認できる） */
export function SendConfirmDialog({ value, sending, onConfirm, onCancel }: SendConfirmProps) {
  const id = useId();
  const rows: [string, string][] = [
    ["宛先", value.to],
    ...(value.cc.trim() ? ([["Cc", value.cc]] as [string, string][]) : []),
    ...(value.bcc.trim() ? ([["Bcc", value.bcc]] as [string, string][]) : []),
    ["件名", value.subject],
  ];
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 md:items-center md:p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby={`${id}-title`}
        className="flex max-h-[90dvh] w-full max-w-lg flex-col rounded-t-lg bg-surface shadow-xl md:rounded-lg"
      >
        <h2 id={`${id}-title`} className="border-b border-border px-4 py-3 text-base font-semibold text-text">
          この内容で送信しますか？
        </h2>
        <dl className="grid grid-cols-[4rem_1fr] gap-x-3 gap-y-1 px-4 py-3 text-sm">
          {rows.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="text-muted">{k}</dt>
              <dd className="break-words text-text">{v}</dd>
            </div>
          ))}
        </dl>
        <pre className="mx-4 mb-3 max-h-60 overflow-auto rounded-sm bg-surface-2 p-3 font-sans text-sm whitespace-pre-wrap text-text">
          {value.body}
        </pre>
        <div className="flex gap-2 border-t border-border p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
          <Button className="flex-1" onClick={onCancel} disabled={sending}>
            戻る
          </Button>
          <Button className={cx("flex-1")} variant="primary" onClick={onConfirm} loading={sending} autoFocus>
            送信する
          </Button>
        </div>
      </div>
    </div>
  );
}
