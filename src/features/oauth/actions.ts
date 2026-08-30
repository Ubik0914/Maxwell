"use server";

import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { loginSchema } from "@/lib/validation/auth";
import {
  authorizeRequestSchema,
  type AuthorizeRequest,
} from "@/lib/validation/oauth";
import { ErrorCode } from "@/lib/errors/codes";
import type { ActionResult } from "@/types/action-result";
import {
  issueAuthorizationCode,
  resolveOAuthClient,
} from "@/features/oauth/authorize";
import { buildAuthorizeErrorRedirect } from "@/lib/oauth/response";

function readOAuthRequest(formData: FormData): AuthorizeRequest | null {
  const parsed = authorizeRequestSchema.safeParse({
    response_type: formData.get("response_type"),
    client_id: formData.get("client_id"),
    redirect_uri: formData.get("redirect_uri"),
    code_challenge: formData.get("code_challenge"),
    code_challenge_method: formData.get("code_challenge_method"),
    state: formData.get("state") || undefined,
    scope: formData.get("scope") || undefined,
    resource: formData.get("resource") || undefined,
  });
  return parsed.success ? parsed.data : null;
}

/**
 * The login form on /oauth/authorize, for a browser with no existing
 * Maxwell session. Logging in here *is* the consent — there is no
 * separate screen after it — since a user who was not already signed in
 * had no session to protect until this moment.
 */
export async function authorizeLoginAction(
  _prevState: ActionResult<null> | null,
  formData: FormData,
): Promise<ActionResult<null>> {
  const oauthRequest = readOAuthRequest(formData);
  if (!oauthRequest) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message:
          "This authorization request is invalid. Start again from the app that sent you here.",
      },
    };
  }

  const parsedLogin = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });
  if (!parsedLogin.success) {
    return {
      success: false,
      error: {
        code: ErrorCode.VALIDATION_ERROR,
        message: parsedLogin.error.issues[0]?.message ?? "Invalid input",
      },
    };
  }

  const supabase = await createClient();
  const { error: signInError } =
    await supabase.auth.signInWithPassword(parsedLogin.data);

  if (signInError) {
    return {
      success: false,
      error: {
        code: ErrorCode.AUTH_INVALID_CREDENTIALS,
        message:
          signInError.code === "email_not_confirmed"
            ? "Please confirm your email before logging in."
            : "Incorrect email or password.",
      },
    };
  }

  const outcome = await issueAuthorizationCode(supabase, oauthRequest);
  if (outcome.kind !== "redirect") {
    return {
      success: false,
      error: {
        code: ErrorCode.UNKNOWN_ERROR,
        message:
          outcome.kind === "invalid_client"
            ? "Unknown client, or redirect_uri does not match its registration."
            : outcome.message,
      },
    };
  }

  redirect(outcome.url);
}

/**
 * The Allow/Deny screen for a browser that already has a Maxwell
 * session. A Server Action is its own POST endpoint, reachable without
 * ever rendering /oauth/authorize first, so client_id/redirect_uri are
 * re-checked here rather than trusted from whoever's page happened to
 * submit this form — a failure sends the browser to /login, never to a
 * redirect_uri this request has not actually earned.
 */
export async function authorizeConsentAction(
  formData: FormData,
): Promise<void> {
  const oauthRequest = readOAuthRequest(formData);
  const supabase = await createClient();
  const client = oauthRequest
    ? await resolveOAuthClient(supabase, oauthRequest)
    : null;

  if (!oauthRequest || !client) {
    redirect("/login");
  }

  if (formData.get("decision") !== "allow") {
    redirect(
      buildAuthorizeErrorRedirect(
        oauthRequest.redirect_uri,
        "access_denied",
        "The user denied the request.",
        oauthRequest.state,
      ),
    );
  }

  const outcome = await issueAuthorizationCode(supabase, oauthRequest);
  if (outcome.kind !== "redirect") {
    redirect(
      buildAuthorizeErrorRedirect(
        oauthRequest.redirect_uri,
        outcome.kind === "invalid_client" ? "invalid_request" : "server_error",
        outcome.kind === "invalid_client" ? undefined : outcome.message,
        oauthRequest.state,
      ),
    );
  }

  redirect(outcome.url);
}
