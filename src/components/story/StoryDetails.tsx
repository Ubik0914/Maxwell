import type { StoryListItem } from "@/repositories/story.repository";
import { Markdown } from "@/components/ui/Markdown";
import { DueDate } from "@/components/task/TaskFields";

/**
 * What a story has to say when you ask it.
 *
 * A row in the drawer is a summary and has to stay one — a title, a
 * rail and four numbers — but the questions it raises are always the
 * same two: what is this story for, and what could I pick up right now.
 * Both are answerable from what the drawer already fetched, so they are
 * answered here rather than by making someone open the story to find
 * out and come back if it wasn't the one.
 *
 * Nothing here is a control. Opening the story is still the row's own
 * press, and every task named is named rather than linked, because a
 * list of small links inside a row that is itself a link is a target
 * nobody can hit on a phone.
 */
export function StoryDetails({
  id,
  story,
  today,
}: {
  id: string;
  story: StoryListItem;
  today: string;
}) {
  const { goal, description, frontier, stats } = story;
  const remaining = stats.ready + stats.inProgress - frontier.length;

  return (
    <div id={id} className="detail-reveal border-t border-border">
      <div>
        <div className="flex flex-col gap-3 px-3 pt-2 pb-3">
          {goal && (
            <div className="flex flex-col gap-0.5">
              <Label>Goal</Label>
              <p className="text-sm text-text">{goal}</p>
            </div>
          )}

          <div className="flex flex-col gap-0.5">
            <Label>About</Label>
            {description ? (
              // Read-only: ticking a box here would be editing a story
              // from a list of stories, which is not what a card is.
              <Markdown className="text-sm">{description}</Markdown>
            ) : (
              <p className="text-sm text-text-faint">No description.</p>
            )}
          </div>

          <div className="flex flex-col gap-0.5">
            <Label>Up next</Label>
            {frontier.length === 0 ? (
              <p className="text-sm text-text-faint">
                {stats.blocked > 0
                  ? "Everything left is waiting on something."
                  : "Nothing to pick up."}
              </p>
            ) : (
              <ul className="flex flex-col gap-1">
                {frontier.map((task) => (
                  <li
                    key={task.id}
                    className="flex items-baseline gap-2 text-sm"
                  >
                    <span
                      aria-hidden="true"
                      className={`h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full ${
                        task.status === "IN_PROGRESS"
                          ? "bg-warning shadow-[0_0_6px_var(--warning)]"
                          : "bg-accent shadow-[0_0_6px_var(--accent)]"
                      }`}
                    />
                    <span className="min-w-0 flex-1 truncate text-text">
                      {task.title}
                    </span>
                    {task.dueDate && (
                      <span className="shrink-0 text-xs">
                        <DueDate
                          dueDate={task.dueDate}
                          today={today}
                          status={task.status}
                        />
                      </span>
                    )}
                  </li>
                ))}
                {remaining > 0 && (
                  <li className="text-xs text-text-faint">
                    and {remaining} more
                  </li>
                )}
              </ul>
            )}
          </div>

          {stats.cancelled > 0 && (
            <p className="text-xs text-text-faint">
              {stats.cancelled} cancelled
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Label({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-[10px] tracking-[0.14em] text-text-faint uppercase">
      {children}
    </span>
  );
}
