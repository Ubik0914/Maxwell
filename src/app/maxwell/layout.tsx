import type { Metadata } from "next";

/*
 * Maxwell's name, manifest and home-screen label, for its pages only.
 * The root layout speaks as the library; this puts Maxwell's identity
 * back on the pages behind /maxwell, which are all behind a sign-in.
 *
 * noindex because nothing outside should point here, and a search
 * engine that found its way in should not be the first to say so.
 */
export const metadata: Metadata = {
  title: "Maxwell — DAG Task Manager",
  description: "Define a Start and a Goal, then build the path between them.",
  applicationName: "Maxwell",
  manifest: "/maxwell/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Maxwell",
    statusBarStyle: "black-translucent",
  },
  robots: { index: false, follow: false },
};

export default function MaxwellLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
