/**
 * What a failed passkey ceremony means to the person holding the phone.
 *
 * Supabase Auth reports server-side refusals as AuthError codes, and the
 * browser's own failures come back as WebAuthnError codes; the one that
 * matters most is neither — the person closed the prompt, which is a
 * choice, not an error, and is reported as `null` (say nothing).
 */
export function passkeyErrorMessage(error: {
  code?: string | null;
  name?: string;
  message?: string;
  cause?: unknown;
}): string | null {
  const cause = error.cause as { name?: string } | undefined;
  if (
    error.code === "ERROR_CEREMONY_ABORTED" ||
    error.name === "AbortError" ||
    cause?.name === "NotAllowedError" ||
    cause?.name === "AbortError"
  ) {
    return null;
  }

  switch (error.code) {
    case "passkey_disabled":
      return "パスキーはまだ有効になっていません（Supabase の設定が必要です）。";
    case "webauthn_credential_not_found":
      return "このパスキーは登録されていません。パスワードでログインしてから登録してください。";
    case "webauthn_credential_exists":
    case "ERROR_AUTHENTICATOR_PREVIOUSLY_REGISTERED":
      return "この端末のパスキーはすでに登録されています。";
    case "too_many_passkeys":
      return "登録できるパスキーの上限に達しています。";
    case "webauthn_challenge_expired":
    case "webauthn_challenge_not_found":
      return "時間切れになりました。もう一度お試しください。";
    case "email_not_confirmed":
      return "メールアドレスの確認が済んでいません。";
    case "user_banned":
      return "このアカウントは利用できません。";
    case "ERROR_INVALID_DOMAIN":
    case "ERROR_INVALID_RP_ID":
      return "このアドレスではパスキーを使えません（Supabase の Relying Party 設定を確認してください）。";
    default:
      return "パスキーで認証できませんでした。";
  }
}
