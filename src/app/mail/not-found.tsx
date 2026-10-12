export default function NotFound() {
  return (
    <main className="flex min-h-dvh flex-col items-center justify-center gap-2 bg-bg p-8 text-center">
      <p className="text-base font-semibold">ページが見つかりません</p>
      <a href="/mail" className="text-sm text-accent underline">
        受信トレイへ
      </a>
    </main>
  );
}
