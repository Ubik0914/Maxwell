import type { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";
import { Skeleton } from "@/components/Skeleton";

function StoriesIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <circle cx="4" cy="10" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="4" r="2" stroke="currentColor" strokeWidth="1.5" />
      <circle cx="16" cy="16" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M6 9.2 14 5M6 10.8l8 5.2"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function MembersIcon() {
  return (
    <svg viewBox="0 0 20 20" fill="none" aria-hidden="true" className="h-4 w-4">
      <circle cx="7" cy="6" r="2.5" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M2.5 16c.6-3 2.2-4.5 4.5-4.5s3.9 1.5 4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.5"
      />
      <circle cx="14.5" cy="7" r="2" stroke="currentColor" strokeWidth="1.5" />
      <path
        d="M12.5 11.2c1.9.3 3.1 1.6 3.6 4.3"
        stroke="currentColor"
        strokeWidth="1.5"
      />
    </svg>
  );
}

/**
 * The chrome around every signed-in page.
 *
 * `workspaceName`/`userEmail` are optional so a route's loading.tsx can
 * render the very same shell with placeholders in their place — the nav
 * and the wordmark are static and correct from the first frame, and
 * only the two data-dependent strings have to wait. That's what keeps a
 * navigation from looking like a frozen screen followed by a full
 * repaint.
 */
export function AppShell({
  workspaceName,
  userEmail,
  children,
}: {
  workspaceName?: string;
  userEmail?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden bg-bg">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-border px-4 py-3 sm:px-6">
        <span className="font-semibold tracking-wide text-accent">
          Maxwell
        </span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:gap-4">
          {workspaceName ? (
            <Link href="/workspaces" className="text-text hover:text-accent">
              {workspaceName}
            </Link>
          ) : (
            <Skeleton className="h-4 w-24" />
          )}
          <span className="hidden text-border-strong sm:inline">|</span>
          {userEmail ? (
            <span className="text-text-muted">{userEmail}</span>
          ) : (
            <Skeleton className="h-4 w-36" />
          )}
          <form action={logoutAction}>
            <button
              type="submit"
              className="text-text-faint hover:text-text"
            >
              Log out
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col sm:flex-row">
        <aside className="shrink-0 border-b border-border px-4 py-3 sm:w-48 sm:border-r sm:border-b-0 sm:py-6">
          <nav className="flex flex-row gap-4 text-sm sm:flex-col sm:gap-2">
            <Link
              href="/stories"
              className="flex items-center gap-2 text-text-muted hover:text-accent"
            >
              <StoriesIcon />
              Stories
            </Link>
            <Link
              href="/settings/members"
              className="flex items-center gap-2 text-text-muted hover:text-accent"
            >
              <MembersIcon />
              Members
            </Link>
          </nav>
        </aside>
        <main className="min-w-0 flex-1 bg-bg">{children}</main>
      </div>
    </div>
  );
}
