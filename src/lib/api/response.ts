import { NextResponse } from "next/server";
import { ErrorCode } from "@/lib/errors/codes";

const STATUS_BY_CODE: Record<string, number> = {
  [ErrorCode.VALIDATION_ERROR]: 400,
  [ErrorCode.AUTH_REQUIRED]: 401,
  [ErrorCode.WORKSPACE_FORBIDDEN]: 403,
  [ErrorCode.WORKSPACE_NOT_FOUND]: 404,
  [ErrorCode.STORY_NOT_FOUND]: 404,
  [ErrorCode.NODE_NOT_FOUND]: 404,
  [ErrorCode.TASK_NOT_FOUND]: 404,
  [ErrorCode.EDGE_NOT_FOUND]: 404,
  [ErrorCode.INVALID_NODE_TYPE]: 409,
  [ErrorCode.INVALID_START_EDGE]: 409,
  [ErrorCode.INVALID_GOAL_EDGE]: 409,
  [ErrorCode.EDGE_ALREADY_EXISTS]: 409,
  [ErrorCode.GRAPH_CYCLE_DETECTED]: 409,
  [ErrorCode.TASK_BLOCKED]: 409,
  [ErrorCode.INVALID_TASK_STATUS]: 409,
  [ErrorCode.INTERNAL_ERROR]: 500,
};

export function statusForErrorCode(code: string): number {
  return STATUS_BY_CODE[code] ?? 400;
}

export function apiSuccess<T>(data: T, status = 200) {
  return NextResponse.json({ data }, { status });
}

export function apiError(code: string, message: string, status?: number) {
  return NextResponse.json(
    { error: { code, message } },
    { status: status ?? statusForErrorCode(code) },
  );
}
