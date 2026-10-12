"use client";
import { webPath, type AccountInfo, type UserSettings } from "@/mail/core";
import { Banner, Button, IconBack, Spinner, Toggle, formatFullDate } from "@/mail/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/mail/client/api";
import { enablePush, getPushPermission, startGmailConnect, type PushPermission } from "@/mail/client/native";

interface AccountResponse {
  userEmail: string;
  accounts: AccountInfo[];
  pushConfigured: boolean;
  watchConfigured: boolean;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-text">{title}</h2>
      <div className="flex flex-col gap-2 px-4 py-3">{children}</div>
    </section>
  );
}

type Message = { kind: "success" | "error" | "info"; text: string };

export function SettingsApp({ initialMessage = null }: { initialMessage?: Message | null }) {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  const [push, setPush] = useState<PushPermission>("unsupported");
  const [message, setMessage] = useState<Message | null>(initialMessage);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [a, s, d] = await Promise.all([
        api<AccountResponse>("/api/account"),
        api<UserSettings>("/api/settings"),
        api<{ count: number }>("/api/devices"),
      ]);
      setAccount(a);
      setSettings(s);
      setDevices(d.count);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
    setPush(await getPushPermission());
  }, []);

  useEffect(() => {
    // Loading the settings on open; load() clears the previous error
    // before it awaits, which is all the rule objects to here.
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    void load();
  }, [load]);

  const run = async (name: string, fn: () => Promise<void>) => {
    setBusy(name);
    setMessage(null);
    try {
      await fn();
    } catch (e) {
      setMessage({ kind: "error", text: errorMessage(e) });
    } finally {
      setBusy(null);
    }
  };

  const patchSettings = (patch: Partial<UserSettings>) =>
    run("settings", async () => {
      setSettings(await api<UserSettings>("/api/settings", { method: "PATCH", body: patch }));
    });

  const acc = account?.accounts[0];

  if (loadError && !account) {
    return (
      <Shell>
        <Banner kind="error" action={{ label: "再試行", onClick: () => void load() }}>
          {loadError}
        </Banner>
      </Shell>
    );
  }
  if (!account || !settings) {
    return (
      <Shell>
        <div className="flex justify-center p-8">
          <Spinner label="読み込み中" />
        </div>
      </Shell>
    );
  }

  return (
    <Shell>
      {message && <Banner kind={message.kind}>{message.text}</Banner>}

      <Section title="接続中のアカウント">
        {acc && (
          <Banner kind="info">Maxwell のアカウント {account.userEmail} に紐づいています。</Banner>
        )}
        {acc ? (
          <>
            <p className="text-sm text-text">{acc.email}（Gmail）</p>
            {acc.status === "reauth_required" ? (
              <Banner kind="warning">Googleの認証が切れています。再接続してください。</Banner>
            ) : (
              <p className="text-xs text-muted">
                最終同期: {acc.lastSyncedAt ? formatFullDate(acc.lastSyncedAt) : "未同期"} ／ 新着監視（watch）:{" "}
                {!account.watchConfigured
                  ? "未設定（サーバーの GMAIL_PUBSUB_TOPIC が必要）"
                  : acc.watchExpiresAt
                    ? `${formatFullDate(acc.watchExpiresAt)} まで有効`
                    : "未開始"}
                {acc.watchLastError && `（直近の更新エラー: ${acc.watchLastError}）`}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <Button loading={busy === "connect"} onClick={() => void run("connect", () => startGmailConnect(webPath("/settings")))}>
                再接続
              </Button>
              <Button
                loading={busy === "sync"}
                onClick={() =>
                  run("sync", async () => {
                    const r = await api<{ newMessages: number }>("/api/sync", { method: "POST" });
                    setMessage({ kind: "success", text: `同期しました（新着 ${r.newMessages} 件）。` });
                    await load();
                  })
                }
              >
                今すぐ同期
              </Button>
            </div>
          </>
        ) : (
          <>
            <p className="text-sm text-muted">Gmail がまだつながっていません。Google で許可すると、ここでメールを読めるようになります。</p>
            <div>
              <Button variant="primary" loading={busy === "connect"} onClick={() => void run("connect", () => startGmailConnect(webPath("/")))}>
                Gmail をつなぐ
              </Button>
            </div>
          </>
        )}
      </Section>

      <Section title="通知">
        <Toggle
          label="新着メールを通知する"
          checked={settings.notificationsEnabled}
          disabled={busy === "settings"}
          onChange={(v) => void patchSettings({ notificationsEnabled: v })}
        />
        <Toggle
          label="通知に送信者と件名を表示する"
          description="オフにすると「新しいメールがあります」とだけ表示します。"
          checked={settings.notificationPreview}
          disabled={busy === "settings" || !settings.notificationsEnabled}
          onChange={(v) => void patchSettings({ notificationPreview: v })}
        />
        <div className="flex flex-col gap-2 border-t border-border pt-3">
          <p className="text-xs text-muted">
            登録済みの端末: {devices ?? 0} 台 ／ この端末:{" "}
            {push === "unsupported" ? "ブラウザ（Androidアプリで通知を受け取れます）" : push === "granted" ? "通知許可済み" : push === "denied" ? "通知が拒否されています（Androidの設定から許可してください）" : "未設定"}
            {!account.pushConfigured && " ／ サーバーのFCMが未設定です"}
          </p>
          <div className="flex flex-wrap gap-2">
            {push !== "unsupported" && (
              <Button
                loading={busy === "push"}
                onClick={() =>
                  run("push", async () => {
                    const r = await enablePush();
                    setPush(r);
                    setMessage(r === "granted" ? { kind: "success", text: "この端末で通知を受け取れるようにしました。" } : { kind: "error", text: "通知が許可されませんでした。" });
                    setTimeout(() => void load(), 1500);
                  })
                }
              >
                この端末で通知を受け取る
              </Button>
            )}
            <Button
              loading={busy === "test"}
              onClick={() =>
                run("test", async () => {
                  const r = await api<{ outcome: string }>("/api/devices/test", { method: "POST" });
                  const text: Record<string, string> = {
                    sent: "テスト通知を送信しました。端末に表示されるか確認してください（アプリを閉じた状態でも試してください）。",
                    no_devices: "通知を受け取る端末が登録されていません。",
                    retryable: "通知サービスが一時的に応答していません。少し待って再試行してください。",
                    fatal: "通知を送信できませんでした。サーバーのFCM設定を確認してください。",
                  };
                  setMessage({ kind: r.outcome === "sent" ? "success" : "error", text: text[r.outcome] ?? r.outcome });
                })
              }
            >
              テスト通知を送る
            </Button>
          </div>
        </div>
      </Section>

      <Section title="外部AIクライアント（MCP）">
        <p className="text-xs text-muted">
          メールは Maxwell の MCP サーバー（蔵書と同じ <code className="select-all">/api/mcp</code>）から検索・取得・返信案・下書き保存ができます。送信はできません。接続は Maxwell のログインで行うので、トークンの発行は不要です。
        </p>
      </Section>

      <Section title="接続解除">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="danger"
            loading={busy === "disconnect"}
            onClick={() => {
              if (!window.confirm("Gmailとの接続を解除します。保存済みのトークン・端末登録・同期情報を削除します（Gmailのメールは削除されません）。よろしいですか？")) return;
              void run("disconnect", async () => {
                await api("/api/account/disconnect", { method: "POST" });
                setMessage({ kind: "success", text: "Gmail との接続を解除しました。" });
                await load();
              });
            }}
          >
            接続を解除する
          </Button>
        </div>
      </Section>
    </Shell>
  );
}

function Shell({ children }: { children: ReactNode }) {
  return (
    <div className="min-h-dvh bg-bg">
      <header className="sticky top-0 z-10 flex items-center gap-2 border-b border-border bg-surface px-2 py-1">
        <a href={webPath("/")} aria-label="メールに戻る" className="inline-flex size-touch items-center justify-center rounded-md hover:bg-surface-2">
          <IconBack />
        </a>
        <h1 className="text-base font-semibold text-text">設定</h1>
      </header>
      <main className="mx-auto flex max-w-2xl flex-col gap-4 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">{children}</main>
    </div>
  );
}
