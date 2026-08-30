import { createHash, randomBytes, randomUUID, timingSafeEqual } from "node:crypto";

/**
 * The bearer credential handed to whoever redeems an authorization code
 * first — 256 bits, so guessing one is not a strategy. Only its sha256
 * hash is ever written to the database (see the oauth_authorization_codes
 * migration); this raw value exists only in the redirect and the token
 * request that immediately follows it.
 */
export function generateAuthorizationCode(): string {
  return randomBytes(32).toString("base64url");
}

/** RFC 7591 gives no format for client_id; a UUID is opaque and unique. */
export function generateClientId(): string {
  return randomUUID();
}

export function sha256Hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/**
 * RFC 7636 S256: the verifier the token endpoint receives must hash to
 * the challenge the authorize endpoint stored. A length check before
 * timingSafeEqual avoids it throwing on mismatched buffer sizes, and
 * comparing hashes rather than a plain `===` on the verifier keeps this
 * off constant-time footguns even though neither value is secret at this
 * point (the code itself already gates redemption).
 */
export function verifyPkceS256(
  codeVerifier: string,
  codeChallenge: string,
): boolean {
  const computed = createHash("sha256").update(codeVerifier).digest("base64url");
  const a = Buffer.from(computed);
  const b = Buffer.from(codeChallenge);
  return a.length === b.length && timingSafeEqual(a, b);
}
