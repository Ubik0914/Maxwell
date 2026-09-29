/**
 * Where to send someone after they sign in, if the page that sent them
 * to /login said so.
 *
 * Only a path on this site is taken. "//evil.example" and "/\evil.example"
 * start with a slash too, and a browser reads both as another host, so
 * they are refused along with anything absolute — an open redirect on
 * the login form is a phishing kit somebody else gets for free.
 */
export function safeNextPath(value: unknown): string | null {
  if (typeof value !== "string") return null;
  if (!value.startsWith("/")) return null;
  if (value.startsWith("//") || value.startsWith("/\\")) return null;
  if (value.length > 2000) return null;
  return value;
}
