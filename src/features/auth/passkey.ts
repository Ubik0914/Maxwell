"use client";

import { createClient } from "@/lib/supabase/client";
import { passkeyErrorMessage } from "@/features/auth/passkeyMessages";

/**
 * Passkeys, through Supabase Auth's own support (experimental; enabled
 * per project under Authentication → Passkeys). The browser client does
 * the whole WebAuthn ceremony and, signing in, writes the session to
 * the same cookies a password sign-in sets — so the server sees the
 * person as signed in with nothing else to do here.
 *
 * Both return a message for the person, or null when there is nothing
 * to say (success, or they closed the prompt).
 */

/** Whether this browser can do WebAuthn at all. */
export function passkeysSupported(): boolean {
  return (
    typeof window !== "undefined" &&
    typeof window.PublicKeyCredential === "function"
  );
}

export async function signInWithPasskey(): Promise<
  { ok: true } | { ok: false; message: string | null }
> {
  const { data, error } = await createClient().auth.signInWithPasskey();
  if (error || !data?.session) {
    return {
      ok: false,
      message: error
        ? passkeyErrorMessage(error)
        : "パスキーで認証できませんでした。",
    };
  }
  return { ok: true };
}

/** Registers a passkey for the person signed in; the name the
 *  authenticator gave it (iCloud キーチェーン, 1Password…) on success. */
export async function registerPasskey(): Promise<
  { ok: true; name: string | null } | { ok: false; message: string | null }
> {
  const { data, error } = await createClient().auth.registerPasskey();
  if (error || !data) {
    return {
      ok: false,
      message: error
        ? passkeyErrorMessage(error)
        : "パスキーを登録できませんでした。",
    };
  }
  return { ok: true, name: data.friendly_name ?? null };
}
