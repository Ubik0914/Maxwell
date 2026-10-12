import type { Metadata, Viewport } from "next";
import Link from "next/link";
import { headers } from "next/headers";

export const metadata: Metadata = {
  title: "ツール",
  description: "蔵書とメールへの入口。",
};

/* The library's dark (styles/library.css), so the dashboard and the
   tools it opens read as one site. */
export const viewport: Viewport = {
  themeColor: "#0d0d0e",
};

type Tool = {
  href: string;
  name: string;
  description: string;
  /*
   * /mail is another Next.js app (mail/, Synedge) that this one only
   * rewrites to, so a client-side <Link> would look for a route that is
   * not here. It has to be a full page load.
   */
  external?: boolean;
};

/*
 * Maxwell (/maxwell) is deliberately absent: nothing reachable from the
 * site's front says it exists (see README, "URL の構成").
 */
const TOOLS: Tool[] = [
  {
    href: "/book",
    name: "蔵書",
    description: "手元にある本の目録。書名・著者・場所で探す。",
  },
  {
    href: "/book/scan",
    name: "連続スキャン",
    description: "バーコードを読むたびに本を登録する。",
  },
  {
    href: "/mail",
    name: "メール",
    description: "Gmail を読む・書く・送る。",
    external: true,
  },
];

/**
 * The site's front door: one tile per tool.
 *
 * It asks for no session of its own. Each tool checks sign-in itself
 * (蔵書 with Supabase, メール with its Google login), so this page is a
 * plain list that answers the same for everyone and costs no round trip.
 */
export default async function DashboardPage() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host");
  const proto = h.get("x-forwarded-proto") ?? "https";
  const origin = host ? `${proto}://${host}` : "";

  return (
    <main className="theme-raycast min-h-dvh bg-bg px-4 py-10 sm:py-16">
      <div className="mx-auto flex w-full max-w-xl flex-col gap-8">
        <header>
          <h1 className="text-2xl font-semibold text-text">ツール</h1>
          <p className="mt-1 text-sm text-text-muted">使うものを選ぶ。</p>
        </header>

        <ul className="grid gap-3 sm:grid-cols-2">
          {TOOLS.map((tool) => {
            const className =
              "flex h-full flex-col gap-1 rounded-xl border border-border bg-surface p-4 transition-colors hover:border-border-strong hover:bg-surface-hover";
            const body = (
              <>
                <span className="text-base font-medium text-text">{tool.name}</span>
                <span className="text-sm text-text-muted">{tool.description}</span>
                <span className="mt-auto pt-2 font-mono text-xs text-text-faint">{tool.href}</span>
              </>
            );
            return (
              <li key={tool.href}>
                {tool.external ? (
                  <a href={tool.href} className={className}>
                    {body}
                  </a>
                ) : (
                  <Link href={tool.href} className={className}>
                    {body}
                  </Link>
                )}
              </li>
            );
          })}
        </ul>

        <section className="flex flex-col gap-2">
          <h2 className="text-sm font-medium text-text">AI クライアントから使う</h2>
          <p className="text-sm text-text-muted">
            蔵書は MCP サーバーとしても使える。claude.ai のカスタムコネクタにこの URL を入れる。
          </p>
          <code className="block overflow-x-auto rounded-lg border border-border bg-surface px-3 py-2 font-mono text-xs text-text">
            {origin}/api/mcp
          </code>
          <p className="text-sm text-text-muted">
            メールの MCP は別サーバー。トークンは
            <a href="/mail/settings" className="mx-1 text-text underline">
              メールの設定
            </a>
            で発行する。
          </p>
        </section>
      </div>
    </main>
  );
}
