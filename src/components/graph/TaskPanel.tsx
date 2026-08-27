import type { GraphNode, TaskStatus } from "@/domain/graph/types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  BLOCKED: "Blocked",
  READY: "Ready",
  IN_PROGRESS: "In Progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

/**
 * Read-only Task detail drawer. Phase 11 (Task CRUD) extends this with
 * editable fields and delete — kept view-only here so nothing half-wired
 * ships in Phase 10.
 */
export function TaskPanel({
  node,
  onClose,
}: {
  node: GraphNode;
  onClose: () => void;
}) {
  return (
    <div className="absolute top-0 right-0 flex h-full w-80 flex-col gap-4 border-l border-gray-200 bg-white p-6 shadow-xl">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-gray-900">{node.title}</h2>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          className="text-gray-400 hover:text-gray-600"
        >
          ×
        </button>
      </div>

      <div className="flex flex-col gap-1">
        <span className="text-xs font-medium tracking-wide text-gray-500 uppercase">
          Status
        </span>
        <span className="text-sm text-gray-900">
          {node.status ? STATUS_LABEL[node.status] : "—"}
        </span>
      </div>

      {node.description && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Description
          </span>
          <p className="text-sm text-gray-700">{node.description}</p>
        </div>
      )}

      {node.dueDate && (
        <div className="flex flex-col gap-1">
          <span className="text-xs font-medium tracking-wide text-gray-500 uppercase">
            Due Date
          </span>
          <span className="text-sm text-gray-900">{node.dueDate}</span>
        </div>
      )}
    </div>
  );
}
