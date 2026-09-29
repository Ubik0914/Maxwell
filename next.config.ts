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
  outputFileTracingIncludes: {
    "/maxwell/docs": ["./src/content/docs/**/*.md"],
    "/maxwell/docs/[slug]": ["./src/content/docs/**/*.md"],
  },
};

export default nextConfig;
