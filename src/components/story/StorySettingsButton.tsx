"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { SettingsIcon } from "@/components/icons";
import {
  StorySettingsDialog,
  type EditableStory,
} from "@/components/story/StorySettingsDialog";

/**
 * The way into a story's settings from the story's own page.
 *
 * Deleting from here has nowhere to return to, so it leaves for the
 * stories list — and it leaves immediately, before the write goes out,
 * because the alternative is holding someone on a page whose subject
 * they have just agreed to destroy.
 */
export function StorySettingsButton({ story }: { story: EditableStory }) {
  const router = useRouter();
  const [isOpen, setIsOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Story settings"
        title="Story settings"
        className="shrink-0 rounded-md p-1 text-text-faint transition-colors hover:bg-surface-hover hover:text-text"
      >
        <SettingsIcon className="h-4 w-4" />
      </button>

      {isOpen && (
        <StorySettingsDialog
          story={story}
          onClose={() => setIsOpen(false)}
          onDeleted={() => router.push("/stories")}
        />
      )}
    </>
  );
}
