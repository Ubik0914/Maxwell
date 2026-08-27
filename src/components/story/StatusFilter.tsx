import Link from "next/link";

const FILTERS = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Archived", value: "ARCHIVED" },
] as const;

export function StatusFilter({ current }: { current: string }) {
  return (
    <div className="flex flex-wrap gap-2">
      {FILTERS.map((filter) => (
        <Link
          key={filter.value}
          href={
            filter.value === "ALL"
              ? "/stories"
              : `/stories?status=${filter.value}`
          }
          className={`rounded-full border px-3 py-1 text-sm transition ${
            current === filter.value
              ? "border-accent bg-accent-soft text-accent"
              : "border-border text-text-muted hover:border-border-strong hover:text-text"
          }`}
        >
          {filter.label}
        </Link>
      ))}
    </div>
  );
}
