import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ScanScreen } from "@/components/library/ScanScreen";

export const metadata: Metadata = {
  title: "連続スキャン — Library",
};

export default async function ScanPage() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) redirect("/login?next=/scan");

  return <ScanScreen />;
}
