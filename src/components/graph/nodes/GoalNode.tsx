import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";
import { NodeShell } from "@/components/graph/nodes/NodeShell";

/**
 * The sink: everything the graph carries is on its way here.
 *
 * Dark until the work actually arrives. A goal that glows from the
 * moment a story is created is decoration — it says the same thing on
 * day one as it does when the last task lands. Lit means reached, and
 * the transition (rather than an animation) is what makes it read as
 * the light arriving with the final surge along the incoming edges.
 */
export function GoalNode({ data }: NodeProps<FlowNode>) {
  const reached = data.reached ?? false;

  return (
    <NodeShell
      pulse={data.pulse}
      border={reached ? "border-success" : "border-border"}
      ambient={
        reached
          ? "shadow-[0_0_16px_var(--success-soft)] transition-[box-shadow,border-color] duration-700 ease-out"
          : "transition-[box-shadow,border-color] duration-700 ease-out"
      }
    >
      <Handle type="target" position={Position.Left} />
      <p
        className={`flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] uppercase transition-colors duration-700 ${
          reached ? "text-success" : "text-text-faint"
        }`}
      >
        <span
          aria-hidden="true"
          className={`h-1.5 w-1.5 rounded-full transition-shadow duration-700 ${
            reached
              ? "bg-current shadow-[0_0_6px_currentColor]"
              : "bg-current opacity-60"
          }`}
        />
        GOAL
      </p>
      <p
        className={`mt-1 truncate text-[13px] leading-snug transition-colors duration-700 ${
          reached ? "text-text" : "text-text-muted"
        }`}
      >
        {data.title}
      </p>
    </NodeShell>
  );
}
