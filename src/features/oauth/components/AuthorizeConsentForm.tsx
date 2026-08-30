import { authorizeConsentAction } from "@/features/oauth/actions";
import { OAuthHiddenFields } from "@/features/oauth/components/OAuthHiddenFields";
import type { AuthorizeRequest } from "@/lib/validation/oauth";

export function AuthorizeConsentForm({
  request,
  clientName,
  email,
}: {
  request: AuthorizeRequest;
  clientName: string | null;
  email: string;
}) {
  return (
    <form
      action={authorizeConsentAction}
      className="flex w-full max-w-sm flex-col gap-4"
    >
      <OAuthHiddenFields request={request} />

      <p className="text-center text-sm text-text-muted">
        <span className="font-medium text-text">{clientName ?? "This app"}</span>{" "}
        wants to connect to your Maxwell account as{" "}
        <span className="font-medium text-text">{email}</span>.
      </p>
      <p className="text-center text-xs text-text-muted">
        It will be able to read and change your workspaces, stories, and
        tasks — the same access you have.
      </p>

      <div className="flex gap-3">
        <button
          type="submit"
          name="decision"
          value="deny"
          className="flex-1 rounded-md border border-border bg-surface px-4 py-2 text-sm font-medium text-text transition hover:bg-bg"
        >
          Deny
        </button>
        <button
          type="submit"
          name="decision"
          value="allow"
          className="flex-1 rounded-md bg-accent px-4 py-2 text-sm font-medium text-inverse transition hover:bg-accent-hover"
        >
          Allow
        </button>
      </div>
    </form>
  );
}
