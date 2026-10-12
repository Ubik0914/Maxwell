"use client";
import { webPath, type AccountInfo, type UserSettings } from "@synedge/mail-core";
import { Banner, Button, IconBack, Spinner, Toggle, formatFullDate } from "@synedge/ui";
import { useCallback, useEffect, useState, type ReactNode } from "react";
import { api, errorMessage } from "@/features/api";
import { enablePush, getPushPermission, type PushPermission } from "@/features/native";

interface AccountResponse {
  accounts: AccountInfo[];
  pushConfigured: boolean;
  watchConfigured: boolean;
}

interface McpToken {
  id: string;
  name: string;
  prefix: string;
  createdAt: string;
  lastUsedAt: string | null;
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-border bg-surface">
      <h2 className="border-b border-border px-4 py-3 text-sm font-semibold text-text">{title}</h2>
      <div className="flex flex-col gap-2 px-4 py-3">{children}</div>
    </section>
  );
}

export function SettingsApp() {
  const [account, setAccount] = useState<AccountResponse | null>(null);
  const [settings, setSettings] = useState<UserSettings | null>(null);
  const [devices, setDevices] = useState<number | null>(null);
  const [tokens, setTokens] = useState<McpToken[]>([]);
  const [newToken, setNewToken] = useState<{ name: string; token: string } | null>(null);
  const [tokenName, setTokenName] = useState("");
  const [push, setPush] = useState<PushPermission>("unsupported");
  const [message, setMessage] = useState<{ kind: "success" | "error" | "info"; text: string } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoadError(null);
    try {
      const [a, s, d, t] = await Promise.all([
        api<AccountResponse>("/api/account"),
        api<UserSettings>("/api/settings"),
        api<{ count: number }>("/api/devices"),
        api<{ tokens: McpToken[] }>("/api/mcp-tokens"),
      ]);
      setAccount(a);
      setSettings(s);
      setDevices(d.count);
      setTokens(t.tokens);
    } catch (e) {
      setLoadError(errorMessage(e));
    }
    setPush(await getPushPermission());
  }, []);

  useEffect(() => {
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
              <Button onClick={() => window.location.assign(webPath(`/api/auth/google/start?platform=web&next=${encodeURIComponent(webPath("/settings"))}`))}>再接続</Button>
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
          <p className="text-sm text-muted">接続されていません。</p>
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
          MCPサーバーへの接続に使うトークンです。トークンは作成時に一度だけ表示されます。MCPからは検索・取得・返信案・下書き保存のみ可能で、送信はできません。
        </p>
        {newToken && (
          <Banner kind="success">
            「{newToken.name}」のトークン：<code className="break-all select-all">{newToken.token}</code>
          </Banner>
        )}
        <ul className="flex flex-col divide-y divide-border">
          {tokens.map((t) => (
            <li key={t.id} className="flex items-center gap-2 py-2 text-sm">
              <span className="flex-1">
                {t.name} <span className="text-xs text-muted">{t.prefix}… ／ 最終利用 {t.lastUsedAt ? formatFullDate(t.lastUsedAt) : "なし"}</span>
              </span>
              <Button
                variant="ghost"
                onClick={() =>
                  run("token", async () => {
                    await api(`/api/mcp-tokens/${t.id}`, { method: "DELETE" });
                    setTokens((x) => x.filter((y) => y.id !== t.id));
                  })
                }
              >
                削除
              </Button>
            </li>
          ))}
        </ul>
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            void run("token", async () => {
              const r = await api<{ id: string; name: string; token: string }>("/api/mcp-tokens", { method: "POST", body: { name: tokenName } });
              setNewToken({ name: r.name, token: r.token });
              setTokenName("");
              const t = await api<{ tokens: McpToken[] }>("/api/mcp-tokens");
              setTokens(t.tokens);
            });
          }}
        >
          <label className="sr-only" htmlFor="token-name">
            トークン名
          </label>
          <input
            id="token-name"
            value={tokenName}
            onChange={(e) => setTokenName(e.target.value)}
            placeholder="例: Claude Desktop"
            maxLength={60}
            className="min-h-touch flex-1 rounded-md border border-border bg-surface px-3 text-sm text-text"
          />
          <Button type="submit" loading={busy === "token"} disabled={!tokenName.trim()}>
            作成
          </Button>
        </form>
      </Section>

      <Section title="ログアウト・接続解除">
        <div className="flex flex-wrap gap-2">
          <Button
            onClick={() =>
              run("logout", async () => {
                await api("/api/auth/logout", { method: "POST" });
                window.location.assign(webPath("/login"));
              })
            }
          >
            ログアウト
          </Button>
          <Button
            variant="danger"
            loading={busy === "disconnect"}
            onClick={() => {
              if (!window.confirm("Gmailとの接続を解除します。保存済みのトークン・端末登録・同期情報を削除します（Gmailのメールは削除されません）。よろしいですか？")) return;
              void run("disconnect", async () => {
                await api("/api/account/disconnect", { method: "POST" });
                window.location.assign(webPath("/login"));
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
