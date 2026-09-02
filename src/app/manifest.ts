import type { MetadataRoute } from "next";

/**
 * What a phone needs before it will let someone keep Maxwell.
 *
 * Installing is not decoration here: a web push subscription on iOS
 * exists only for a site added to the home screen, so the manifest is
 * the price of the notifications. On Android and desktop it buys the
 * ordinary things — a window without a URL bar, an icon among the other
 * apps, a splash colour that matches the page instead of flashing white
 * on the way in.
 *
 * `start_url` is "/", which is the redirect that already knows whether
 * to send you to your stories or to sign in. An installed app opened
 * cold should land where the site would have put you, not on a page
 * that assumes a session it may not have.
 *
 * `id` is fixed and must stay that way. It is how a browser recognises
 * this as the app it already has installed; changing it later hands
 * somebody a second copy of Maxwell beside the one they were using.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "Maxwell — DAG Task Manager",
    short_name: "Maxwell",
    description:
      "Define a Start and a Goal, then build the path between them.",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0d14",
    theme_color: "#0a0d14",
    // Both ways up. The graph is a canvas that pans, the lists read
    // fine in either, and a task manager somebody opens on a notification
    // should not argue about which way the phone is being held.
    orientation: "any",
    categories: ["productivity"],
    icons: [
      {
        src: "/icons/icon-192.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/icons/icon-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      // Kept separate from the two above rather than declared "any
      // maskable" on one file: a platform that crops takes this one,
      // which is drawn small enough to survive it, and everything else
      // takes the full-bleed drawing instead of a shrunken one.
      {
        src: "/icons/icon-maskable-512.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
