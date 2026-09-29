import type { MetadataRoute } from "next";

/**
 * The site's manifest — the library's, since "/" is the library.
 *
 * Installing is not decoration: a web push subscription on iOS exists
 * only for a site added to the home screen, and on Android and desktop
 * it buys a window without a URL bar and an icon among the other apps.
 *
 * `id` stays "/". It used to be Maxwell's, so a phone that installed
 * Maxwell from here now has the library under that icon; Maxwell has a
 * manifest of its own (id "/maxwell", see app/maxwell/manifest.webmanifest)
 * and is installed again from inside /maxwell. That is the price of
 * this one saying nothing about it.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    id: "/",
    name: "蔵書",
    short_name: "蔵書",
    description: "みんなの本棚の目録。",
    start_url: "/",
    scope: "/",
    display: "standalone",
    background_color: "#0a0d14",
    theme_color: "#0a0d14",
    // Both ways up: a shelf reads fine either way, and the scanner
    // should not argue about which way the phone is being held.
    orientation: "any",
    categories: ["books", "productivity"],
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
