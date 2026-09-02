import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Offline — Maxwell",
};

/**
 * The one page the service worker keeps a copy of.
 *
 * Every other page is somebody's graph as it stands right now, and a
 * saved copy of one is a lie the moment anyone moves a task. So the
 * offline answer is this rather than yesterday's story: it says what
 * happened, and it costs nothing to be wrong about.
 *
 * No link out, because there is nowhere to go — the reload is the
 * whole of what can be done from here, and the browser's own is the
 * one that works from a page served out of a cache.
 */
export default function Offline() {
  return (
    <div className="flex h-dvh flex-col items-center justify-center gap-4 bg-bg px-6 text-center">
      <h1 className="text-2xl font-semibold text-text">You&apos;re offline</h1>
      <p className="max-w-sm text-sm text-text-muted">
        Maxwell needs the network to show a story — a graph you cannot
        change is a picture, and a stale one would be worse than none.
        This page will work again the moment the connection does.
      </p>
    </div>
  );
}
