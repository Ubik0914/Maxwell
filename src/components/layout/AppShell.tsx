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
    <div className="flex min-h-screen flex-col">
      <header className="flex items-center justify-between border-b border-gray-200 px-6 py-3">
        <span className="font-semibold text-gray-900">Maxwell</span>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/workspaces" className="text-gray-700 hover:underline">
            {workspaceName}
          </Link>
          <span className="text-gray-300">|</span>
          <span className="text-gray-700">{userEmail}</span>
          <form action={logoutAction}>
            <button type="submit" className="text-gray-500 hover:underline">
              Log out
            </button>
          </form>
        </div>
      </header>
      <div className="flex flex-1">
        <aside className="w-48 shrink-0 border-r border-gray-200 px-4 py-6">
          <nav className="flex flex-col gap-2 text-sm">
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
        <main className="flex-1">{children}</main>
      </div>
    </div>
  );
}
