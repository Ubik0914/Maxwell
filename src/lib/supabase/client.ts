import { createBrowserClient } from "@supabase/ssr";
import type { Database } from "@/types/database";

export function createClient() {
  return createBrowserClient<Database>(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      db: { schema: "dag" },
      // Passkeys (auth/passkey.ts). Set on the one shared client:
      // createBrowserClient hands every caller the same instance, so the
      // flag has to be there from the first call, whoever makes it.
      auth: { experimental: { passkey: true } },
    },
  );
}
