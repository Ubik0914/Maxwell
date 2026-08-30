import type { AuthorizeRequest } from "@/lib/validation/oauth";

/**
 * Carries the /oauth/authorize query string through whichever form
 * handles it next (login or consent), so the server action sees the
 * same request the page validated rather than re-deriving it from
 * nothing.
 */
export function OAuthHiddenFields({ request }: { request: AuthorizeRequest }) {
  return (
    <>
      <input type="hidden" name="response_type" value={request.response_type} />
      <input type="hidden" name="client_id" value={request.client_id} />
      <input type="hidden" name="redirect_uri" value={request.redirect_uri} />
      <input type="hidden" name="code_challenge" value={request.code_challenge} />
      <input
        type="hidden"
        name="code_challenge_method"
        value={request.code_challenge_method}
      />
      {request.state && (
        <input type="hidden" name="state" value={request.state} />
      )}
      {request.scope && (
        <input type="hidden" name="scope" value={request.scope} />
      )}
      {request.resource && (
        <input type="hidden" name="resource" value={request.resource} />
      )}
    </>
  );
}
