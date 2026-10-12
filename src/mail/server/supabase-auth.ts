import "server-only";
import { requireApiUser } from "@/lib/api/auth";
import type { AuthPort } from "./session";

/**
 * 本番の AuthPort。Maxwell の /api/v1 と同じく、Bearer トークンがあればそれを、
 * なければ Supabase のセッション Cookie を使う（next/headers から読むので req は使わない）。
 */
export const supabaseAuth: AuthPort = {
  async currentUser() {
    const { user } = await requireApiUser();
    if (!user?.email) return null;
    return { id: user.id, email: user.email };
  },
};
