import type { Metadata } from "next";
import Link from "next/link";
import { listDocs } from "@/features/docs/content";

export const metadata: Metadata = {
  title: "使い方 — Maxwell",
  description:
    "Maxwell の使い方。ストーリーの Start と Goal を決め、その間をタスクと依存で埋めるまで。",
};

/**
 * The guide's front door: what this is, and everything in it.
 *
 * A list of pages with a line each rather than a page of prose that
 * happens to link onward — somebody arriving here either wants the
 * beginning or wants the one page that answers their question, and both
 * of those are choices, not reading.
 */
export default function DocsIndex() {
  const docs = listDocs();

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-2">
        <h1 className="text-xl font-semibold text-text">使い方</h1>
        <p className="text-sm leading-relaxed text-text-muted">
          Maxwell は、ストーリーの始まりと終わりを先に決めて、その間をタスクと依存関係で埋めていくタスク管理ツール。
          最初に読むなら「はじめに」から。
        </p>
      </div>

      <ul className="flex flex-col gap-0.5">
        {docs.map((doc, index) => (
          <li key={doc.slug}>
            <Link
              href={`/docs/${doc.slug}`}
              className="flex gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-surface-hover"
            >
              <span className="mt-0.5 shrink-0 text-xs tabular-nums text-text-faint">
                {String(index + 1).padStart(2, "0")}
              </span>
              <span className="flex min-w-0 flex-col gap-0.5">
                <span className="text-sm font-medium text-text">
                  {doc.title}
                </span>
                <span className="text-xs leading-relaxed text-text-faint">
                  {doc.summary}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
