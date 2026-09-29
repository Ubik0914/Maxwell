import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg text-center">
      <h1 className="text-2xl font-semibold text-text">
        ページが見つかりません
      </h1>
      <p className="max-w-sm text-sm text-text-muted">
        お探しのページは存在しないか、表示する権限がありません。
      </p>
      <Link
        href="/"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent-hover"
      >
        蔵書に戻る
      </Link>
    </div>
  );
}
