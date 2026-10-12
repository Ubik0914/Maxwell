import Link from "next/link";

/** メールの環境変数（Google・DB・暗号鍵）がまだないときの画面。蔵書など他の画面は影響を受けない */
export function NotConfigured() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col items-center justify-center gap-4 px-4 text-center">
      <h1 className="text-xl font-semibold text-text">メールはまだ使えません</h1>
      <p className="text-sm text-muted">
        サーバーにメール用の設定（Google の OAuth・データベース・暗号鍵）が入っていません。README の「メール」の手順で設定すると使えるようになります。
      </p>
      <Link href="/" className="text-sm text-text underline">
        トップに戻る
      </Link>
    </main>
  );
}
