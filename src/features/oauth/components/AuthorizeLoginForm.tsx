"use client";

import { useActionState } from "react";
import { authorizeLoginAction } from "@/features/oauth/actions";
import { Spinner } from "@/components/Spinner";
import { OAuthHiddenFields } from "@/features/oauth/components/OAuthHiddenFields";
import type { AuthorizeRequest } from "@/lib/validation/oauth";
import type { ActionResult } from "@/types/action-result";

const initialState: ActionResult<null> | null = null;

export function AuthorizeLoginForm({
  request,
  clientName,
}: {
  request: AuthorizeRequest;
  clientName: string | null;
}) {
  const [state, formAction, isPending] = useActionState(
    authorizeLoginAction,
    initialState,
  );

  return (
    <form action={formAction} className="flex w-full max-w-sm flex-col gap-4">
      <OAuthHiddenFields request={request} />

      <p className="text-center text-sm text-text-muted">
        Log in to let{" "}
        <span className="font-medium text-text">{clientName ?? "this app"}</span>{" "}
        connect to your Maxwell account.
      </p>

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
        Log in and continue
      </button>
    </form>
  );
}
