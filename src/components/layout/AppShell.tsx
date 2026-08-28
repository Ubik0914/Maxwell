import type { ReactNode } from "react";
import { AppNav } from "@/components/layout/AppNav";

/**
 * The chrome around every signed-in page.
 *
 * Navigation and account metadata used to occupy a permanent header row
 * and a permanent sidebar — two strips of chrome on every screen, on a
 * phone stacked above the content. Both now live in the drawer AppNav
 * owns, leaving a single thin bar and the whole rest of the viewport to
 * the page.
 *
 * `workspaceName`/`userEmail` are optional so a route's loading.tsx can
 * render the very same shell with placeholders in their place, which is
 * what keeps a navigation from looking like a frozen screen followed by
 * a full repaint.
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
      <AppNav workspaceName={workspaceName} userEmail={userEmail} />
      <main className="min-w-0 flex-1 bg-bg">{children}</main>
    </div>
  );
}
