import type { NextConfig } from "next";

const isDev = process.env.NODE_ENV !== "production";

/*
 * The mail screens' CSP (carried over from Synedge). A message body is
 * shown in a sandboxed srcdoc iframe with a meta CSP of its own; that
 * iframe inherits this one too, which is why img-src allows https for
 * "show images". connect-src keeps Supabase for the session refresh the
 * rest of the app does from the browser.
 */
const mailCsp = [
  "default-src 'self'",
  `script-src 'self' 'unsafe-inline'${isDev ? " 'unsafe-eval'" : ""}`,
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: https: http:",
  "font-src 'self' data:",
  `connect-src 'self' ${process.env.NEXT_PUBLIC_SUPABASE_URL ?? ""}`.trim(),
  "frame-src 'self' about:",
  "frame-ancestors 'none'",
  "form-action 'self' https://accounts.google.com",
  "base-uri 'self'",
  "object-src 'none'",
].join("; ");

const nextConfig: NextConfig = {
  /* config options here */
  agentRules: false,

  // The mail's database driver (src/mail/database) is server-only and
  // talks Postgres directly; it stays out of the bundle.
  serverExternalPackages: ["postgres"],

  /*
   * No redirects from Maxwell's old root paths (/stories, /docs, …).
   * They would tell anyone who guessed a common path that /maxwell
   * exists, and Maxwell is not meant to be findable from the library.
   *
   * The library moved from "/" to "/book" when the root became the tool
   * dashboard. Its old paths are the library's own, not Maxwell's, so
   * sending them on gives nothing away. (/Book → /book is in proxy.ts:
   * these sources match without regard to case, so here it would send
   * /book to itself.)
   */
  async redirects() {
    return [
      { source: "/scan", destination: "/book/scan", permanent: true },
    ];
  },

  async headers() {
    return [
      {
        // ":path*" matches zero segments too, so this covers /mail itself.
        source: "/mail/:path*",
        headers: [
          { key: "Content-Security-Policy", value: mailCsp },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "no-referrer" },
          { key: "X-Frame-Options", value: "DENY" },
          { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=()" },
        ],
      },
      {
        source: "/mail/api/:path*",
        headers: [{ key: "Cache-Control", value: "no-store" }],
      },
    ];
  },

  /*
   * The guide is Markdown read off disk. The pages are prerendered, so
   * that read happens at build time and never on a request — but a
   * route that is statically generated today can stop being one after
   * an unrelated edit, and the failure would be a 500 in production
   * only. Naming the files here costs nothing and takes that away.
   */
  outputFileTracingIncludes: {
    "/maxwell/docs": ["./src/content/docs/**/*.md"],
    "/maxwell/docs/[slug]": ["./src/content/docs/**/*.md"],
  },
};

export default nextConfig;
