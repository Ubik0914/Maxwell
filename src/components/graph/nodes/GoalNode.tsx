import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";
import { NodeShell } from "@/components/graph/nodes/NodeShell";

/**
 * The sink: everything the graph carries is on its way here.
 */
export function GoalNode({ data }: NodeProps<FlowNode>) {
  return (
    <NodeShell
      pulse={data.pulse}
      border="border-success"
      ambient="shadow-[0_0_14px_var(--success-soft)]"
    >
      <Handle type="target" position={Position.Left} />
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-success uppercase">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]"
        />
        GOAL
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-text">
        {data.title}
      </p>
    </NodeShell>
  );
}
