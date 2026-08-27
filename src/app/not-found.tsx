import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 bg-bg text-center">
      <h1 className="text-2xl font-semibold text-text">Page not found</h1>
      <p className="max-w-sm text-sm text-text-muted">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t
        have access to it.
      </p>
      <Link
        href="/stories"
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent-hover"
      >
        Back to Stories
      </Link>
    </div>
  );
}
