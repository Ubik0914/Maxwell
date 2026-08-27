import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TaskStatus } from "@/domain/graph/types";
import type { FlowNode } from "@/components/graph/types";

const STATUS_LABEL: Record<TaskStatus, string> = {
  BLOCKED: "Blocked",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

const STATUS_ICON: Record<TaskStatus, string> = {
  BLOCKED: "🔒",
  READY: "○",
  IN_PROGRESS: "●",
  DONE: "✓",
  CANCELLED: "✗",
};

export function TaskNode({ data }: NodeProps<FlowNode>) {
  const status = data.status ?? "READY";

  return (
    <div className="w-56 rounded-lg border border-gray-300 bg-white px-4 py-3 shadow-sm">
      <Handle type="target" position={Position.Left} />
      <p className="text-sm font-medium text-gray-900">{data.title}</p>
      <p className="mt-1 text-xs text-gray-600">
        {STATUS_ICON[status]} {STATUS_LABEL[status].toUpperCase()}
      </p>
      {data.dueDate && (
        <p className="mt-1 text-xs text-gray-400">{data.dueDate}</p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
