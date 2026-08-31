"use client";

import { useMemo } from "react";
import Link from "next/link";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  taskMarkerOffsets,
  toggleTaskAt,
} from "@/lib/markdown/task-list";

/**
 * The slice of a hast node this needs.
 *
 * A task list item is not announced by a prop — react-markdown stopped
 * passing `checked` to `li` — so it has to be recognised the way
 * remark-gfm actually emits it: an `<input type="checkbox">` as the
 * item's first child, carrying the tick. `position` comes along for
 * free and is what ties the item back to its own line in the source.
 */
interface HastNode {
  type?: string;
  tagName?: string;
  properties?: { type?: unknown; checked?: unknown };
  children?: HastNode[];
  position?: { start?: { offset?: number } };
}

function taskCheckbox(node: HastNode | undefined): HastNode | undefined {
  return node?.children?.find(
    (child) =>
      child.type === "element" &&
      child.tagName === "input" &&
      child.properties?.type === "checkbox",
  );
}

/**
 * A task's description, rendered.
 *
 * People write lists, headings and quotes into a description whether or
 * not anything renders them — the only question is whether they see
 * `- [ ] 未完了のタスク` or a checkbox. This renders it.
 *
 * `react-markdown` builds React elements rather than setting innerHTML,
 * so there is no HTML injection surface to guard: raw HTML in the
 * source is escaped and shown as text, which is the right default for
 * a field anyone on a workspace can write into.
 *
 * Checkboxes are live when `onToggleTask` is given. A checklist you
 * cannot tick is a tease in a task manager, and the change is a
 * one-character edit to the source the caller already owns. Which
 * checkbox a rendered item owns is worked out from the offset mdast
 * records for it, not by counting as the tree is walked — counting
 * would mean a mutable tally living across a render.
 */
export function Markdown({
  children,
  onToggleTask,
  className = "",
}: {
  children: string;
  /** Given the nth checkbox in the source, flipped. Omit for read-only. */
  onToggleTask?: (nextSource: string) => void;
  className?: string;
}) {
  const markers = useMemo(() => taskMarkerOffsets(children), [children]);

  const components = useMemo<Components>(
    () => ({
      // Checkboxes are rendered by the `li` below, which knows whether
      // the item is a task and where it sits. remark-gfm's own
      // <input type="checkbox"> would arrive without either.
      input: () => null,

      li({ children: content, node }) {
        const item = node as HastNode | undefined;
        const box = taskCheckbox(item);
        if (!box) {
          return <li>{content}</li>;
        }
        const checked = box.properties?.checked === true;

        const start = item?.position?.start?.offset;
        const index =
          start === undefined
            ? -1
            : markers.findIndex((offset) => offset >= start);

        const canToggle = onToggleTask !== undefined && index !== -1;
        const control = canToggle ? (
          <button
            type="button"
            role="checkbox"
            aria-checked={checked}
            onClick={() => onToggleTask(toggleTaskAt(children, index))}
            className="md-check"
          >
            <CheckMark />
          </button>
        ) : (
          <span role="checkbox" aria-checked={checked} className="md-check">
            <CheckMark />
          </span>
        );

        return (
          <li className="md-task" data-checked={checked}>
            {control}
            <span className="md-task-label">{content}</span>
          </li>
        );
      },

      // A wide table scrolls inside its own box instead of widening the
      // panel it sits in.
      table: ({ children: content }) => (
        <div className="md-table-scroll">
          <table>{content}</table>
        </div>
      ),

      // A link out of this app opens beside it rather than replacing
      // the story somebody was in. A link *into* it is navigation —
      // the guide cross-references its own pages, and a new tab per
      // cross-reference is a pile of tabs, not a trail.
      a: ({ href, children: content }) =>
        href?.startsWith("/") ? (
          <Link href={href}>{content}</Link>
        ) : (
          <a href={href} target="_blank" rel="noreferrer noopener">
            {content}
          </a>
        ),
    }),
    [children, markers, onToggleTask],
  );

  return (
    <div className={`md-body ${className}`}>
      <ReactMarkdown remarkPlugins={[remarkGfm]} components={components}>
        {children}
      </ReactMarkdown>
    </div>
  );
}

function CheckMark() {
  return (
    <svg
      viewBox="0 0 20 20"
      fill="none"
      stroke="currentColor"
      strokeWidth="3"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      className="h-full w-full"
    >
      <path d="M4.5 10.5 8.5 14.5 15.5 6" />
    </svg>
  );
}
