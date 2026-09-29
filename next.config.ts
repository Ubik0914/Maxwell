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
  /*
   * Maxwell used to live at the root; "/" is the library now. Old
   * bookmarks, links pasted into tasks and notifications already sitting
   * on a lock screen still point at the old paths, so they are carried
   * across rather than left to 404.
   */
  async redirects() {
    return ["stories", "workspaces", "routines", "docs", "settings"].flatMap(
      (section) => [
        {
          source: `/${section}`,
          destination: `/maxwell/${section}`,
          permanent: true,
        },
        {
          source: `/${section}/:path*`,
          destination: `/maxwell/${section}/:path*`,
          permanent: true,
        },
      ],
    );
  },

  outputFileTracingIncludes: {
    "/maxwell/docs": ["./src/content/docs/**/*.md"],
    "/maxwell/docs/[slug]": ["./src/content/docs/**/*.md"],
  },
};

export default nextConfig;
