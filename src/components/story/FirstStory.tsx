"use client";

import { useState } from "react";
import { CreateStoryDialog } from "@/components/story/CreateStoryDialog";
import { PlusIcon } from "@/components/icons";

/**
 * The one screen in the app that isn't a story: the one you see when
 * there are none.
 *
 * A workspace with no stories has nothing to navigate, so it offers the
 * only thing that can be done from here rather than an empty list with
 * filters over it. Once there is one story, this is never seen again —
 * /stories sends you into a story from then on.
 */
export function FirstStory({ workspaceId }: { workspaceId: string }) {
  const [isCreateOpen, setIsCreateOpen] = useState(false);

  return (
    <div className="flex min-h-[60vh] flex-col items-center justify-center gap-4 px-6 text-center">
      <div className="flex flex-col gap-1">
        <p className="text-lg font-medium text-text">No stories yet.</p>
        <p className="text-sm text-text-muted">
          Define a goal and build the path toward it.
        </p>
      </div>

      <button
        type="button"
        onClick={() => setIsCreateOpen(true)}
        className="flex items-center gap-1.5 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-colors hover:bg-accent-hover"
      >
        <PlusIcon />
        New Story
      </button>

      {isCreateOpen && (
        <CreateStoryDialog
          workspaceId={workspaceId}
          onClose={() => setIsCreateOpen(false)}
        />
      )}
    </div>
  );
}
