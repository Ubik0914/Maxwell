"use client";

import { useActionState, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { KeyIcon } from "@/components/icons";
import { passkeysSupported, signInWithPasskey } from "@/features/auth/passkey";
import { loginAction } from "@/features/auth/actions";
import { Spinner } from "@/components/Spinner";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<null> | null = null;

export function LoginForm({ next }: { next?: string }) {
  const [state, formAction, isPending] = useActionState(
    loginAction,
    initialState,
  );
  const router = useRouter();
  // Known only in the browser; the button appears once it is.
  const [canUsePasskey, setCanUsePasskey] = useState(false);
  const [passkeyPending, setPasskeyPending] = useState(false);
  const [passkeyError, setPasskeyError] = useState<string | null>(null);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect -- see above
    setCanUsePasskey(passkeysSupported());
  }, []);

  async function passkey() {
    setPasskeyPending(true);
    setPasskeyError(null);
    const result = await signInWithPasskey();
    if (result.ok) {
      // The session is in the cookies now; the server renders the
      // destination as the person it has just met.
      router.replace(next ?? "/");
      router.refresh();
      return;
    }
    setPasskeyPending(false);
    setPasskeyError(result.message);
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      {next && <input type="hidden" name="next" value={next} />}
      <div className="flex flex-col gap-1">
        <label htmlFor="email" className="text-sm font-medium text-text-muted">
          Email
        </label>
        <input
          id="email"
          name="email"
          type="email"
          required
          autoComplete="email"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="password"
          className="text-sm font-medium text-text-muted"
        >
          Password
        </label>
        <input
          id="password"
          name="password"
          type="password"
          required
          autoComplete="current-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </div>

      {state && !state.success && (
        <p role="alert" className="text-sm text-danger select-text">
          {state.error.message}
        </p>
      )}

      <button
        type="submit"
        disabled={isPending}
        className="flex items-center justify-center gap-2 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition hover:bg-accent-hover disabled:opacity-50"
      >
        {isPending && <Spinner />}
        Log in
      </button>

      {canUsePasskey && (
        <>
          <div className="flex items-center gap-3 text-xs text-text-faint">
            <span className="h-px flex-1 bg-border" />
            または
            <span className="h-px flex-1 bg-border" />
          </div>
          <button
            type="button"
            onClick={() => void passkey()}
            disabled={passkeyPending || isPending}
            className="flex items-center justify-center gap-2 rounded-md border border-border px-4 py-2 text-sm font-medium text-text transition hover:bg-surface-hover disabled:opacity-50"
          >
            {passkeyPending ? <Spinner /> : <KeyIcon />}
            パスキーでログイン
          </button>
          {passkeyError && (
            <p role="alert" className="text-sm text-danger select-text">
              {passkeyError}
            </p>
          )}
        </>
      )}

      <p className="text-center text-sm text-text-muted">
        Don&apos;t have an account?{" "}
        <Link href="/signup" className="font-medium text-accent underline">
          Sign up
        </Link>
      </p>
    </form>
  );
}
