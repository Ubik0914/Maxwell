"use client";

import { useState } from "react";
import type { WorkspaceMembership } from "@/repositories/workspace.repository";
import { WorkspaceList } from "@/components/workspace/WorkspaceList";
import { CreateWorkspaceDialog } from "@/components/workspace/CreateWorkspaceDialog";
import { SectionLabel } from "@/components/ui/SectionLabel";
import { PlusIcon } from "@/components/icons";

/**
 * What a brand new account sees, and the only thing it can do.
 *
 * The same screen FirstStory is, one level up: nothing to list, nothing
 * to filter, so it offers the one move there is rather than an empty
 * list with a heading over it.
 */
function FirstWorkspace({ onCreate }: { onCreate: () => void }) {
  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-text">No workspaces yet.</p>
        <p className="text-sm text-text-muted">
          A workspace holds your stories, and whoever you share them with.
        </p>
      </div>

      <button
        type="button"
        onClick={onCreate}
        className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover"
      >
        <PlusIcon />
        New Workspace
      </button>
    </div>
  );
}

/**
 * The workspaces screen.
 *
 * It used to be its own little site: a centred column with a page
 * heading two sizes larger than anything else in the app, cards where
 * the app has rows, an always-open form where the app has dialogs, and
 * no way back except the browser's own — the one signed-in screen with
 * neither the top bar nor the drawer on it, which is what made it read
 * as somewhere else rather than somewhere in here.
 *
 * What it is is a list of things you switch between, which the drawer
 * already knows how to draw: a section label, a "+" that opens a
 * dialog, and rows that mark the one you are in. So it is drawn the
 * same way, inside the same chrome (see the page), and switching
 * workspace stops feeling like leaving the product and coming back.
 *
 * One component owns both states because both open the same dialog: the
 * "+" in the header when there is a list, and the empty screen's own
 * button when there is not.
 */
export function WorkspaceScreen({
  memberships,
  currentWorkspaceId,
}: {
  memberships: WorkspaceMembership[];
  currentWorkspaceId?: string;
}) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <>
      {memberships.length === 0 ? (
        <FirstWorkspace onCreate={() => setIsCreateOpen(true)} />
      ) : (
        <div className="mx-auto flex w-full max-w-2xl flex-col gap-2 px-2 py-6 sm:px-4">
          <div className="flex items-center justify-between gap-2 px-3">
            <SectionLabel>Workspaces</SectionLabel>
            <button
              type="button"
              onClick={() => setIsCreateOpen(true)}
              aria-label="New workspace"
              title="New workspace"
              className="-m-1 rounded-full p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-accent"
            >
              <PlusIcon />
            </button>
          </div>

          <WorkspaceList
            memberships={memberships}
            currentWorkspaceId={currentWorkspaceId}
          />
        </div>
      )}

      {isCreateOpen && (
        <CreateWorkspaceDialog onClose={() => setIsCreateOpen(false)} />
      )}
    </>
  );
}
