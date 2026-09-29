/**
 * Maxwell's own manifest, linked only from inside /maxwell.
 *
 * The site-wide one at /manifest.webmanifest belongs to the library and
 * names nothing else. This is what a phone reads when Maxwell itself is
 * added to the home screen: its own id, so the two install side by side
 * instead of one replacing the other, and a scope that keeps the library
 * out of Maxwell's window.
 *
 * A route handler rather than a second manifest.ts, which Next only
 * accepts at the root of the app.
 */
export const dynamic = "force-static";

export function GET() {
  return Response.json(
    {
      id: "/maxwell",
      name: "Maxwell — DAG Task Manager",
      short_name: "Maxwell",
      description:
        "Define a Start and a Goal, then build the path between them.",
      start_url: "/maxwell",
      scope: "/maxwell/",
      display: "standalone",
      background_color: "#0a0d14",
      theme_color: "#0a0d14",
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
        {
          src: "/icons/icon-maskable-512.png",
          sizes: "512x512",
          type: "image/png",
          purpose: "maskable",
        },
      ],
    },
    { headers: { "Content-Type": "application/manifest+json" } },
  );
}
