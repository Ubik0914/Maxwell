import { Handle, Position, type NodeProps } from "@xyflow/react";
import type { FlowNode } from "@/components/graph/types";

export function GoalNode({ data }: NodeProps<FlowNode>) {
  return (
    <div className="w-56 rounded-lg border-2 border-gray-900 bg-white px-4 py-3 shadow-sm">
      <p className="text-xs font-semibold tracking-wide text-gray-500 uppercase">
        GOAL
      </p>
      <p className="mt-1 text-sm text-gray-900">{data.title}</p>
      <Handle type="target" position={Position.Left} />
    </div>
  );
}
