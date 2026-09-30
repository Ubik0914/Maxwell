import type { Metadata, Viewport } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScanScreen } from "@/components/library/ScanScreen";

export const metadata: Metadata = {
  title: "連続スキャン — Library",
};

/* The library's own dark (styles/library.css), behind the status bar
   and the home-screen splash, rather than Maxwell's navy. */
export const viewport: Viewport = {
  themeColor: "#0d0d0e",
};

export default async function ScanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/scan");

  return <ScanScreen />;
}
