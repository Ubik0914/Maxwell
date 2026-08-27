import Link from "next/link";

const FILTERS = [
  { label: "All", value: "ALL" },
  { label: "Active", value: "ACTIVE" },
  { label: "Completed", value: "COMPLETED" },
  { label: "Archived", value: "ARCHIVED" },
] as const;

export function StatusFilter({ current }: { current: string }) {
  return (
    <div className="flex gap-2">
      {FILTERS.map((filter) => (
        <Link
          key={filter.value}
          href={
            filter.value === "ALL"
              ? "/stories"
              : `/stories?status=${filter.value}`
          }
          className={`rounded-full px-3 py-1 text-sm ${
            current === filter.value
              ? "bg-gray-900 text-white"
              : "bg-gray-100 text-gray-700 hover:bg-gray-200"
          }`}
        >
          {filter.label}
        </Link>
      ))}
    </div>
  );
}
