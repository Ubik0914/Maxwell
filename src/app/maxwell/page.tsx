import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

/**
 * Maxwell's own front door, now that "/" belongs to the library.
 * Same answer the root used to give: your stories, or sign in first.
 */
export default async function MaxwellHome() {
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  redirect(user ? "/maxwell/stories" : "/login?next=/maxwell");
}
