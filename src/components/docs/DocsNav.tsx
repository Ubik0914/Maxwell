"use client";

import { useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { DocMeta } from "@/features/docs/content";
import { SectionLabel } from "@/components/ui/SectionLabel";

/**
 * The guide's table of contents, in the two shapes it has to take.
 *
 * On a wide screen it is a column beside the page, which is what a
 * reader expects of documentation and what lets them see where they
 * are in the whole. On a phone there is no "beside", so it becomes the
 * row of chips this app already uses for filters: one line, scrolling
 * sideways, cut off at the edge to say there is more. A drawer would
 * be the other answer, and it would hide the one thing a reader on a
 * small screen most needs — what else there is.
 */
export function DocsNav({ docs }: { docs: DocMeta[] }) {
  const pathname = usePathname();
  const currentChip = useRef<HTMLAnchorElement>(null);

  /*
   * Bring the chip for the page you are on into the row.
   *
   * A row of nine chips on a phone shows about three, and arriving on
   * the seventh page means a nav that is scrolled to somewhere you are
   * not — which reads as "you are on the first page" rather than as
   * "there is more to the left". `block: "nearest"` keeps it to the
   * horizontal move: the row is already in view, and scrolling the
   * article you just opened would be a worse trade than the one it is
   * fixing.
   */
  useEffect(() => {
    currentChip.current?.scrollIntoView({ inline: "center", block: "nearest" });
  }, [pathname]);

  return (
    <nav aria-label="Docs" className="md:w-56 md:shrink-0">
      <div className="hidden md:sticky md:top-6 md:flex md:flex-col md:gap-1.5">
        <div className="px-3">
          <SectionLabel>Guide</SectionLabel>
        </div>
        <ul className="flex flex-col gap-0.5">
          {docs.map((doc) => {
            const href = `/docs/${doc.slug}`;
            const isCurrent = pathname === href;
            return (
              <li key={doc.slug}>
                <Link
                  href={href}
                  aria-current={isCurrent ? "page" : undefined}
                  className={`block rounded-lg px-3 py-1.5 text-sm transition-colors ${
                    isCurrent
                      ? "bg-accent-soft text-accent"
                      : "text-text-muted hover:bg-surface-hover hover:text-text"
                  }`}
                >
                  {doc.title}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="scroll-x flex gap-1.5 border-b border-border px-3 py-2.5 md:hidden">
        {docs.map((doc) => {
          const href = `/docs/${doc.slug}`;
          const isCurrent = pathname === href;
          return (
            <Link
              key={doc.slug}
              ref={isCurrent ? currentChip : undefined}
              href={href}
              aria-current={isCurrent ? "page" : undefined}
              className={`shrink-0 rounded-full border px-2.5 py-0.5 text-xs transition-colors ${
                isCurrent
                  ? "border-accent bg-accent-soft text-accent"
                  : "border-border text-text-muted hover:border-border-strong hover:text-text"
              }`}
            >
              {doc.title}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
