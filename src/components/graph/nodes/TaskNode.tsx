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

const STATUS_STYLE: Record<
  TaskStatus,
  { border: string; text: string; glow: string; flowColor?: string }
> = {
  BLOCKED: {
    border: "border-border",
    text: "text-text-faint",
    glow: "shadow-none",
  },
  READY: {
    border: "border-accent",
    text: "text-accent",
    glow: "shadow-[0_0_12px_var(--accent-soft)]",
    flowColor: "var(--accent)",
  },
  IN_PROGRESS: {
    border: "border-warning",
    text: "text-warning",
    glow: "shadow-[0_0_12px_var(--warning-soft)]",
    flowColor: "var(--warning)",
  },
  DONE: {
    border: "border-success",
    text: "text-success",
    glow: "shadow-[0_0_12px_var(--success-soft)]",
  },
  CANCELLED: {
    border: "border-border-strong",
    text: "text-text-faint",
    glow: "shadow-none",
  },
};

export function TaskNode({ data }: NodeProps<FlowNode>) {
  const status = data.status ?? "READY";
  const style = STATUS_STYLE[status];

  return (
    <div
      className={`w-56 rounded-lg border bg-surface px-4 py-3 ${style.border} ${style.glow} ${
        style.flowColor ? "node-flow" : ""
      }`}
      style={
        style.flowColor
          ? ({ "--flow-color": style.flowColor } as React.CSSProperties)
          : undefined
      }
    >
      <Handle type="target" position={Position.Left} />
      <p className="text-sm font-medium text-text">{data.title}</p>
      <p className={`mt-1 text-xs ${style.text}`}>
        {STATUS_ICON[status]} {STATUS_LABEL[status].toUpperCase()}
      </p>
      {data.dueDate && (
        <p className="mt-1 text-xs text-text-faint">{data.dueDate}</p>
      )}
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
