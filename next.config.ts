import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  agentRules: false,

  /*
   * The guide is Markdown read off disk. The pages are prerendered, so
   * that read happens at build time and never on a request — but a
   * route that is statically generated today can stop being one after
   * an unrelated edit, and the failure would be a 500 in production
   * only. Naming the files here costs nothing and takes that away.
   */
  outputFileTracingIncludes: {
    "/docs": ["./src/content/docs/**/*.md"],
    "/docs/[slug]": ["./src/content/docs/**/*.md"],
  },
};

export default nextConfig;
