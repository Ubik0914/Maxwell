import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";

export function GoalNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="w-56 rounded-lg border-2 border-success bg-surface px-4 py-3 shadow-[0_0_14px_var(--success-soft)]">
      <p className="text-xs font-semibold tracking-wide text-success uppercase">
        GOAL
      </p>
      <p className="mt-1 text-sm text-text">{data.title}</p>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
