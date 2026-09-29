import type { ReadingStatus } from "@/domain/library/filter";

export const READING_STATUS_LABEL: Record<ReadingStatus, string> = {
  UNREAD: "未読",
  READING: "読書中",
  READ: "読了",
};

export const READING_STATUS_TONE: Record<ReadingStatus, string> = {
  UNREAD: "border-border text-text-muted",
  READING: "border-warning/40 bg-warning-soft text-warning",
  READ: "border-success/40 bg-success-soft text-success",
};
