import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";

export function StartNode({ data }: NodeProps<FlowNode>) {
  return (
    <div
      className="node-flow w-56 rounded-lg border-2 border-accent bg-surface px-4 py-3 shadow-[0_0_14px_var(--accent-soft)]"
      style={{ "--flow-color": "var(--accent)" } as React.CSSProperties}
    >
      <p className="text-xs font-semibold tracking-wide text-accent uppercase">
        START
      </p>
      <p className="mt-1 text-sm text-text">{data.title}</p>
      <Handle type="source" position={Position.Right} />
    </div>
  );
}
