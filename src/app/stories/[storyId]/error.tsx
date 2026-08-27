"use client";

export default function StoryGraphError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="flex h-screen flex-col items-center justify-center gap-4">
      <p className="text-lg font-medium text-gray-900">
        Could not load this story.
      </p>
      <button
        type="button"
        onClick={() => reset()}
        className="rounded-md bg-gray-900 px-4 py-2 text-sm font-medium text-white"
      >
        Retry
      </button>
    </div>
  );
}
