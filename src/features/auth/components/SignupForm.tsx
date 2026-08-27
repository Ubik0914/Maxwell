"use client";

import { useActionState } from "react";
import Link from "next/link";
import { signupAction } from "@/features/auth/actions";
import { Spinner } from "@/components/Spinner";
import type { ActionResult } from "@/types/action-result";

type SignupData = { requiresEmailConfirmation: boolean };

const initialState: ActionResult<SignupData> | null = null;

export function SignupForm() {
  const [state, formAction, isPending] = useActionState(
    signupAction,
    initialState,
  );

  if (state?.success && state.data.requiresEmailConfirmation) {
    return (
      <div className="flex w-full max-w-sm flex-col items-center gap-2 text-center">
        <h2 className="text-lg font-semibold text-text">Check your email</h2>
        <p className="text-sm text-text-muted">
          We sent a confirmation link to your email address. Follow it to
          finish creating your account.
        </p>
      </div>
    );
  }

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <div className="flex flex-col gap-1">
        <label htmlFor="name" className="text-sm font-medium text-text-muted">
          Name
        </label>
        <input
          id="name"
          name="name"
          type="text"
          required
          autoComplete="name"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </div>
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
          minLength={8}
          autoComplete="new-password"
          className="rounded-md border border-border bg-surface px-3 py-2 text-sm text-text focus:border-accent focus:outline-none"
        />
      </div>
      <div className="flex flex-col gap-1">
        <label
          htmlFor="passwordConfirmation"
          className="text-sm font-medium text-text-muted"
        >
          Password Confirmation
        </label>
        <input
          id="passwordConfirmation"
          name="passwordConfirmation"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
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
        Sign up
      </button>

      <p className="text-center text-sm text-text-muted">
        Already have an account?{" "}
        <Link href="/login" className="font-medium text-accent underline">
          Log in
        </Link>
      </p>
    </form>
  );
}
