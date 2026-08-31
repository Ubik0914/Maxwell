import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";
import { getDoc, listDocs, neighbours } from "@/features/docs/content";
import { Markdown } from "@/components/ui/Markdown";

/**
 * Every page of the guide, built once. Nothing here reads a cookie or a
 * header, so the whole route is prerendered and the Markdown never
 * reaches a request.
 */
export function generateStaticParams() {
  return listDocs().map((doc) => ({ slug: doc.slug }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) return {};
  return {
    title: `${doc.title} — Maxwell`,
    description: doc.summary,
  };
}

export default async function DocPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const doc = getDoc(slug);
  if (!doc) notFound();

  const { previous, next } = neighbours(slug);

  return (
    <article className="flex flex-col gap-8">
      {/* The h1 comes out of the Markdown itself, so md-docs sizes it
          rather than this page repeating the title above it. */}
      <Markdown className="md-docs">{doc.body}</Markdown>

      {(previous || next) && (
        <nav
          aria-label="前後のページ"
          className="flex flex-wrap gap-2 border-t border-border pt-5"
        >
          {previous && (
            <Link
              href={`/docs/${previous.slug}`}
              className="flex min-w-0 flex-col gap-0.5 rounded-lg border border-border px-3 py-2 transition-colors hover:border-accent"
            >
              <span className="text-[10px] tracking-[0.14em] text-text-faint uppercase">
                前
              </span>
              <span className="truncate text-sm text-text">
                {previous.title}
              </span>
            </Link>
          )}
          {next && (
            <Link
              href={`/docs/${next.slug}`}
              className="ml-auto flex min-w-0 flex-col items-end gap-0.5 rounded-lg border border-border px-3 py-2 transition-colors hover:border-accent"
            >
              <span className="text-[10px] tracking-[0.14em] text-text-faint uppercase">
                次
              </span>
              <span className="truncate text-sm text-text">{next.title}</span>
            </Link>
          )}
        </nav>
      )}
    </article>
  );
}
