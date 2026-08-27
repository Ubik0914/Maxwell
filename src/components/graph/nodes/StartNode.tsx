import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";
import { NodeShell } from "@/components/graph/nodes/NodeShell";

/**
 * The origin of the circuit: always energized, which is why it keeps a
 * standing cyan glow while task nodes have to earn theirs.
 */
export function StartNode({ data }: NodeProps<FlowNode>) {
  return (
    <NodeShell
      pulse={data.pulse}
      border="border-accent"
      ambient="shadow-[0_0_14px_var(--accent-soft)]"
    >
      <p className="flex items-center gap-1.5 text-[10px] font-semibold tracking-[0.18em] text-accent uppercase">
        <span
          aria-hidden="true"
          className="h-1.5 w-1.5 rounded-full bg-current shadow-[0_0_6px_currentColor]"
        />
        START
      </p>
      <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-text">
        {data.title}
      </p>
      <Handle type="source" position={Position.Right} />
    </NodeShell>
  );
}
