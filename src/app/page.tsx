import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { listBooks } from "@/repositories/book.repository";
import { LibraryScreen } from "@/components/library/LibraryScreen";

export const metadata: Metadata = {
  title: "蔵書 — Library",
  description: "手元にある本の目録。",
};

/* The library's own dark (styles/library.css), behind the status bar
   and the home-screen splash, rather than Maxwell's navy. */
export const viewport: Viewport = {
  themeColor: "#0d0d0e",
};

/**
 * The library: the books somebody owns, where they are, and whether
 * they have been read.
 *
 * Maxwell used to answer here and now lives at /maxwell. The two share
 * the sign-in and nothing else, so this page asks for a session the
 * same way and otherwise knows nothing about workspaces or stories.
 */
export default async function LibraryPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/");

  const books = await listBooks(supabase);

  return <LibraryScreen initialBooks={books} userEmail={user.email ?? ""} />;
}
