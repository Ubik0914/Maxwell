import type { ReactNode } from "react";
import Link from "next/link";
import { logoutAction } from "@/features/auth/actions";

export function AppShell({
  workspaceName,
  userEmail,
  children,
}: {
  workspaceName: string;
  userEmail: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen w-full flex-col overflow-x-hidden">
      <header className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-b border-gray-200 px-4 py-3 sm:px-6">
        <span className="font-semibold text-gray-900">Maxwell</span>
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm sm:gap-4">
          <Link href="/workspaces" className="text-gray-700 hover:underline">
            {workspaceName}
          </Link>
          <span className="hidden text-gray-300 sm:inline">|</span>
          <span className="text-gray-700">{userEmail}</span>
          <form action={logoutAction}>
            <button type="submit" className="text-gray-500 hover:underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1 flex-col sm:flex-row">
        <aside className="shrink-0 border-b border-gray-200 px-4 py-3 sm:w-48 sm:border-r sm:border-b-0 sm:py-6">
          <nav className="flex flex-row gap-4 text-sm sm:flex-col sm:gap-2">
            <Link
              href="/stories"
              className="text-gray-700 hover:text-gray-900"
            >
              Stories
            </Link>
            <Link
              href="/settings/members"
              className="text-gray-700 hover:text-gray-900"
            >
              Members
            </Link>
          </nav>
        </aside>
        <main className="min-w-0 flex-1">{children}</main>
      </div>
    </div>
  );
}
