"use client";

import { useState, useTransition, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { createTaskAction } from "@/features/graph/actions";
import { useEscapeKey } from "@/hooks/useEscapeKey";
import { Spinner } from "@/components/Spinner";
import { Modal } from "@/components/Modal";

export function CreateTaskDialog({ storyId }: { storyId: string }) {
  const [isOpen, setIsOpen] = useState(false);
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const router = useRouter();
  useEscapeKey(() => setIsOpen(false), isOpen);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    // Rough "near the canvas center" placement with slight jitter so
    // repeated creates don't stack exactly on top of each other.
    const position = {
      x: 400 + Math.random() * 80,
      y: 220 + Math.random() * 80,
    };

    startTransition(async () => {
      const formData = new FormData();
      formData.set("storyId", storyId);
      formData.set("title", title);
      formData.set("description", description);
      formData.set("x", String(position.x));
      formData.set("y", String(position.y));

      const result = await createTaskAction(null, formData);
      if (!result.success) {
        setError(result.error.message);
        return;
      }

      setError(null);
      setTitle("");
      setDescription("");
      setIsOpen(false);
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="text-sm text-text-muted hover:text-accent"
      >
        + Task
      </button>

      {isOpen && (
        <Modal
          title="New Task"
          subtitle="A node materialises on the canvas."
          onClose={() => setIsOpen(false)}
        >
          <form onSubmit={handleSubmit} className="flex flex-col gap-4">
            <div className="flex flex-col gap-1">
              <label
                htmlFor="task-title"
                className="text-sm font-medium text-text-muted"
              >
                Title *
              </label>
              <input
                id="task-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                required
                autoFocus
                maxLength={200}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            <div className="flex flex-col gap-1">
              <label
                htmlFor="task-description"
                className="text-sm font-medium text-text-muted"
              >
                Description
              </label>
              <textarea
                id="task-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                rows={2}
                maxLength={5000}
                className="rounded-md border border-border bg-bg px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
              />
            </div>

            {error && (
              <p role="alert" className="text-sm text-danger select-text">
                {error}
              </p>
            )}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-md px-4 py-2 text-sm font-medium text-text-muted hover:text-text"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isPending}
                className="flex items-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent-hover disabled:opacity-50"
              >
                {isPending && <Spinner />}
                Create
              </button>
            </div>
          </form>
        </Modal>
      )}
    </>
  );
}
