"use client";
import { Banner, Button } from "@synedge/ui";
import { useState } from "react";
import { startLogin } from "@/features/native";

export function LoginPanel({ error, next }: { error: string | null; next: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg p-4">
      <div className="w-full max-w-sm overflow-hidden rounded-lg border border-border bg-surface">
        <div className="flex flex-col gap-3 p-6">
          <h1 className="text-xl font-bold text-text">Synedge</h1>
          <p className="text-sm text-muted">Gmail アカウントでログインします。初回は Gmail の読み取り・整理・下書き・送信の許可を求めます。</p>
          <Button
            variant="primary"
            loading={busy}
            onClick={async () => {
              setBusy(true);
              try {
                await startLogin(next);
              } finally {
                // 外部ブラウザから戻らなかった場合に再操作できるようにする
                setTimeout(() => setBusy(false), 3000);
              }
            }}
          >
            Googleでログイン
          </Button>
        </div>
        {error && <Banner kind="error">{error}</Banner>}
      </div>
    </main>
  );
}
