"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import {
  archiveStoryAction,
  deleteStoryAction,
  unarchiveStoryAction,
  updateStoryAction,
} from "@/features/story/actions";
import { useToast } from "@/components/Toast";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Modal } from "@/components/Modal";
import { DeleteConfirmDialog } from "@/components/graph/DeleteConfirmDialog";

export interface EditableStory {
  id: string;
  title: string;
  description: string | null;
  status: "ACTIVE" | "COMPLETED" | "ARCHIVED";
}

/**
 * Everything you can do to a story that isn't drawing its graph:
 * rename it, describe it, put it away, throw it out.
 *
 * One dialog rather than a row of controls or a "⋯" menu, because
 * these are the operations you reach for rarely and deliberately, and
 * three of the four want a confirmation or a text field anyway. Putting
 * them together also means the destructive pair sits below a rule,
 * visibly apart from the two edits above it.
 *
 * Archive is not the same kind of thing as ACTIVE/COMPLETED — those two
 * are derived from the DAG and nobody chooses between them, while
 * archiving is the one manual override. That is why it reads as a
 * reversible action here rather than as a third option in a status
 * picker.
 */
export function StorySettingsDialog({
  story,
  onClose,
  onDeleted,
  onChanged,
}: {
  story: EditableStory;
  onClose: () => void;
  /** The list refreshes; the story's own page has to leave. */
  onDeleted: () => void;
  /**
   * A rename or an archive went through.
   *
   * `router.refresh()` reaches anything the server rendered, which is
   * not everything any more: the drawer's list of stories is fetched by
   * the browser when it opens, so it has to be told separately that
   * what it holds is now out of date.
   */
  onChanged?: () => void;
}) {
  const router = useRouter();
  const { showError } = useToast();
  const [title, setTitle] = useState(story.title);
  const [description, setDescription] = useState(story.description ?? "");
  const [isDeleteOpen, setIsDeleteOpen] = useState(false);
  const [, startTransition] = useTransition();
  // The confirmation, when open, owns Escape — a small window closes
  // before the surface behind it. Exclusive, because this can be opened
  // from the drawer, which is listening too: one press should put away
  // one thing.
  useEscapeKey(onClose, !isDeleteOpen, { exclusive: true });

  const isArchived = story.status === "ARCHIVED";
  const isUnchanged =
    title.trim() === story.title &&
    description.trim() === (story.description ?? "");

  function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    // Closed on submit, like every other write in the app: the decision
    // was made when Save was pressed, and a spinner held over it until
    // the server agrees makes the interface look like it is asking
    // permission. A failure interrupts with a toast.
    onClose();
    startTransition(async () => {
      const result = await updateStoryAction({
        storyId: story.id,
        title: title.trim(),
        description: description.trim() || null,
      });
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      router.refresh();
      onChanged?.();
    });
  }

  function handleArchiveToggle() {
    onClose();
    startTransition(async () => {
      const result = isArchived
        ? await unarchiveStoryAction(story.id)
        : await archiveStoryAction(story.id);
      if (!result.success) {
        showError(result.error.message);
        return;
      }
      router.refresh();
      onChanged?.();
    });
  }

  function handleDelete() {
    setIsDeleteOpen(false);
    onClose();
    onDeleted();
    startTransition(async () => {
      const result = await deleteStoryAction(story.id);
      if (!result.success) {
        showError(result.error.message);
      }
    });
  }

  return (
    <>
      <Modal title="Story settings" onClose={onClose}>
        <form onSubmit={handleSave} className="flex flex-col gap-4">
          <div className="flex flex-col gap-1">
            <label
              htmlFor="story-title"
              className="text-sm font-medium text-text-muted"
            >
              Title *
            </label>
            <input
              id="story-title"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
              autoFocus
              maxLength={200}
              className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text transition-colors focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex flex-col gap-1">
            <label
              htmlFor="story-description"
              className="text-sm font-medium text-text-muted"
            >
              Description
            </label>
            <textarea
              id="story-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={4}
              maxLength={5000}
              placeholder="What is this story for?"
              className="resize-none rounded-md border border-border bg-bg px-3 py-2 text-sm leading-relaxed text-text transition-colors placeholder:text-text-faint focus:border-accent focus:outline-none"
            />
          </div>

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-md px-4 py-2 text-sm font-medium text-text-muted transition-colors hover:text-text"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isUnchanged || title.trim().length === 0}
              className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition-opacity hover:bg-accent-hover disabled:opacity-40"
            >
              Save
            </button>
          </div>
        </form>

        <hr className="my-5 border-border" />

        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">
              {isArchived ? "Restore this story" : "Archive this story"}
            </p>
            <p className="mt-0.5 text-xs text-text-faint">
              {isArchived
                ? "It goes back to whatever its graph says it is."
                : "It stays readable, out of the way of the active list."}
            </p>
          </div>
          <button
            type="button"
            onClick={handleArchiveToggle}
            className="shrink-0 rounded-md border border-border px-3 py-1.5 text-sm font-medium text-text-muted transition-colors hover:border-border-strong hover:text-text"
          >
            {isArchived ? "Restore" : "Archive"}
          </button>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-text">Delete this story</p>
            <p className="mt-0.5 text-xs text-text-faint">
              Its tasks and their dependencies go with it. This cannot be
              undone.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setIsDeleteOpen(true)}
            className="shrink-0 rounded-md border border-danger/40 px-3 py-1.5 text-sm font-medium text-danger transition-colors hover:bg-danger-soft"
          >
            Delete
          </button>
        </div>
      </Modal>

      {isDeleteOpen && (
        <DeleteConfirmDialog
          title={story.title}
          isPending={false}
          onConfirm={handleDelete}
          onCancel={() => setIsDeleteOpen(false)}
        />
      )}
    </>
  );
}
