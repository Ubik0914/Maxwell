import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { TaskStatus } from "@/domain/graph/types";
import type { FlowNode } from "@/components/graph/types";
import { NodeShell, StatusDot } from "@/components/graph/nodes/NodeShell";
import { NodeBranchButton } from "@/components/graph/nodes/NodeBranchButton";

const STATUS_LABEL: Record<TaskStatus, string> = {
  BLOCKED: "Blocked",
  READY: "Ready",
  IN_PROGRESS: "In progress",
  DONE: "Done",
  CANCELLED: "Cancelled",
};

/**
 * Per-status appearance. `ambient` is the looping animation that says
 * what the node is doing right now — deliberately empty for the states
 * that aren't doing anything, since a canvas where everything moves
 * says nothing. `orbit` turns on the perimeter light for work in
 * flight.
 */
const STATUS_STYLE: Record<
  TaskStatus,
  { border: string; text: string; ambient: string; orbit: boolean }
> = {
  BLOCKED: {
    border: "border-border",
    text: "text-text-faint",
    ambient: "node-blocked",
    orbit: false,
  },
  READY: {
    border: "border-accent",
    text: "text-accent",
    ambient: "node-ready",
    orbit: false,
  },
  IN_PROGRESS: {
    border: "border-warning/50",
    text: "text-warning",
    // A steady glow under the travelling rim light. The orbit carries
    // the state on its own, but it's the one ambient effect that
    // genuinely moves — so it's removed under reduced motion, and this
    // is what still tells an in-progress node from an idle one.
    ambient: "shadow-[0_0_12px_var(--warning-soft)]",
    orbit: true,
  },
  DONE: {
    border: "border-success/60",
    text: "text-success",
    ambient: "shadow-[0_0_10px_var(--success-soft)]",
    orbit: false,
  },
  CANCELLED: {
    border: "border-border",
    text: "text-text-faint",
    ambient: "opacity-50",
    orbit: false,
  },
};

export function TaskNode({ id, data }: NodeProps<FlowNode>) {
  const status = data.status ?? "READY";
  const style = STATUS_STYLE[status];

  return (
    <NodeShell
      pulse={data.pulse}
      border={style.border}
      ambient={style.ambient}
      orbit={style.orbit}
    >
      <Handle type="target" position={Position.Left} />
      <p className="truncate text-[13px] leading-snug font-medium text-text">
        {data.title}
      </p>
      <div
        className={`mt-1.5 flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.14em] uppercase ${style.text}`}
      >
        <StatusDot status={status} />
        <span>{STATUS_LABEL[status]}</span>
        {data.dueDate && (
          <span className="ml-auto font-normal tracking-normal text-text-faint">
            {data.dueDate.slice(5)}
          </span>
        )}
      </div>
      <Handle type="source" position={Position.Right} />
      {!data.readOnly && <NodeBranchButton nodeId={id} />}
    </NodeShell>
  );
}
