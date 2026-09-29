import type { ReactNode } from "react";
import Link from "next/link";
import { listDocs } from "@/features/docs/content";
import { DocsNav } from "@/components/docs/DocsNav";

/**
 * The guide's own chrome.
 *
 * Not AppShell, and the difference is deliberate: the guide is read by
 * people who may have no workspace or story yet, and AppShell's bar
 * carries a drawer full of them, which for such a reader is a menu of
 * placeholders. (It is behind the sign-in like the rest of /maxwell.)
 *
 * So it borrows the bar's measurements and nothing else: the same
 * height, the same rule underneath, and one way back into the app.
 */
export default function DocsLayout({ children }: { children: ReactNode }) {
  const docs = listDocs();

  return (
    <div className="flex min-h-dvh w-full flex-col overflow-x-hidden bg-bg">
      <header className="flex items-center gap-2.5 border-b border-border px-3 py-2 sm:px-4">
        <Link
          href="/maxwell/docs"
          className="rounded-md px-1 py-0.5 text-sm font-semibold text-text transition-colors hover:text-accent"
        >
          Maxwell Docs
        </Link>
        <Link
          href="/maxwell/stories"
          className="ml-auto rounded-md px-1 py-0.5 text-sm text-text-muted transition-colors hover:text-accent"
        >
          アプリを開く
        </Link>
      </header>

      <div className="mx-auto flex w-full max-w-5xl min-w-0 flex-1 flex-col md:flex-row md:gap-10 md:px-4 md:py-8">
        <DocsNav docs={docs} />
        <main className="min-w-0 flex-1 px-4 py-6 md:px-0 md:py-0">
          {children}
        </main>
      </div>
    </div>
  );
}
