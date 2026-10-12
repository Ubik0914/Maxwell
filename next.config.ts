import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  agentRules: false,

  /*
   * No redirects from Maxwell's old root paths (/stories, /docs, …).
   * They would tell anyone who guessed a common path that /maxwell
   * exists, and Maxwell is not meant to be findable from the library.
   */

  /*
   * The guide is Markdown read off disk. The pages are prerendered, so
   * that read happens at build time and never on a request — but a
   * route that is statically generated today can stop being one after
   * an unrelated edit, and the failure would be a 500 in production
   * only. Naming the files here costs nothing and takes that away.
   */
  /*
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

  /*
   * /mail is Synedge (mail/), a Next.js app of its own deployed as its
   * own Vercel project with basePath "/mail". This app only forwards to
   * it, so the two share an origin without sharing a build. MAIL_ORIGIN
   * is that deployment's origin; unset (local dev without mail running),
   * /mail is a 404 like any other missing page.
   */
  async rewrites() {
    const mail = process.env.MAIL_ORIGIN?.replace(/\/+$/, "");
    if (!mail) return [];
    return [
      { source: "/mail", destination: `${mail}/mail` },
      { source: "/mail/:path*", destination: `${mail}/mail/:path*` },
    ];
  },

  outputFileTracingIncludes: {
    "/maxwell/docs": ["./src/content/docs/**/*.md"],
    "/maxwell/docs/[slug]": ["./src/content/docs/**/*.md"],
  },
};

export default nextConfig;
