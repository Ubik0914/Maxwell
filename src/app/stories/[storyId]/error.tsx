"use client";

export default function StoryGraphError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg">
      <p className="text-lg font-medium text-text">
        Could not load this story.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse hover:bg-accent-hover"
      >
        Retry
      </button>
    </div>
  );
}
