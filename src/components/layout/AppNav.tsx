import { MenuButton } from "@/components/layout/MenuButton";
import { Skeleton } from "@/components/Skeleton";

/**
 * The top bar. Everything that is *about the account* rather than about
 * the page — switching workspace, who you are, logging out — lives in
 * the drawer now; what stays here is the way in, the product name, and
 * the current workspace as orientation only.
 *
 * No state of its own any more, so no "use client": the button and the
 * drawer it owns are the only part of this that has to run in the
 * browser, and they say so themselves.
 */
export function AppNav({
  workspaceId,
  workspaceName,
  userEmail,
}: {
  workspaceId?: string;
  workspaceName?: string;
  userEmail?: string;
}) {
  return (
    <header className="flex items-center gap-2.5 border-b border-border px-3 py-2 sm:px-4">
      <MenuButton
        workspaceId={workspaceId}
        workspaceName={workspaceName}
        userEmail={userEmail}
        className="-ml-1"
      />
      <span className="font-semibold tracking-wide text-accent">Maxwell</span>
      {workspaceName ? (
        <span className="min-w-0 truncate text-sm text-text-faint">
          <span aria-hidden="true" className="mr-2">
            ·
          </span>
          {workspaceName}
        </span>
      ) : (
        <Skeleton className="h-4 w-24" />
      )}
    </header>
  );
}
