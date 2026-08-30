import { createClient } from "@/lib/supabase/server";
import { authorizeRequestSchema } from "@/lib/validation/oauth";
import { resolveOAuthClient } from "@/features/oauth/authorize";
import { AuthorizeLoginForm } from "@/features/oauth/components/AuthorizeLoginForm";
import { AuthorizeConsentForm } from "@/features/oauth/components/AuthorizeConsentForm";

type SearchParams = Record<string, string | string[] | undefined>;

function ErrorScreen({ message }: { message: string }) {
  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <p className="max-w-sm text-center text-sm text-danger select-text">
        {message}
      </p>
    </main>
  );
}

/**
 * RFC 6749 §3.1 authorization endpoint, the one hop a human is actually
 * present for. Everything before this page (registration, metadata
 * discovery) and after it (the token exchange) happens between servers;
 * this is where the account owner decides whether a client gets in.
 */
export default async function AuthorizePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const raw = await searchParams;
  const normalized = Object.fromEntries(
    Object.entries(raw).map(([key, value]) => [
      key,
      Array.isArray(value) ? value[0] : value,
    ]),
  );

  const parsed = authorizeRequestSchema.safeParse(normalized);
  if (!parsed.success) {
    return (
      <ErrorScreen
        message={
          parsed.error.issues[0]?.message ?? "Invalid authorization request."
        }
      />
    );
  }

  const oauthRequest = parsed.data;
  const supabase = await createClient();
  const client = await resolveOAuthClient(supabase, oauthRequest);

  // Neither client_id nor redirect_uri is trustworthy yet — sending the
  // browser to an unverified redirect_uri here would be exactly the
  // open redirect this check exists to prevent, so a mismatch fails in
  // place instead.
  if (!client) {
    return (
      <ErrorScreen message="Unknown client, or redirect_uri does not match its registration." />
    );
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <main className="flex min-h-dvh items-center justify-center bg-bg px-4">
      <div className="flex w-full max-w-sm flex-col items-center gap-6">
        <h1 className="text-2xl font-semibold text-accent">
          {user ? "Allow access" : "Log in"}
        </h1>
        {user ? (
          <AuthorizeConsentForm
            request={oauthRequest}
            clientName={client.client_name}
            email={user.email ?? user.id}
          />
        ) : (
          <AuthorizeLoginForm
            request={oauthRequest}
            clientName={client.client_name}
          />
        )}
      </div>
    </main>
  );
}
