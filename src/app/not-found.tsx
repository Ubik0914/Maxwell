import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4 text-center">
      <h1 className="text-2xl font-semibold text-gray-900">Page not found</h1>
      <p className="max-w-sm text-sm text-gray-600">
        The page you&apos;re looking for doesn&apos;t exist or you don&apos;t
        have access to it.
      </p>
      <Link
        href="/stories"
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Back to Stories
      </Link>
    </div>
  );
}
