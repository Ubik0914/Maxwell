import { z } from "zod";

export const createTaskSchema = z.object({
  storyId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .optional(),
  position: z.object({
    x: z.number().finite(),
    y: z.number().finite(),
  }),
});

export const updateTaskSchema = z.object({
  taskId: z.string().uuid(),
  title: z
    .string()
    .trim()
    .min(1, "Title is required")
    .max(200, "Title must be 200 characters or fewer")
    .optional(),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .nullable()
    .optional(),
  assigneeId: z.string().uuid().nullable().optional(),
  priority: z.number().int().min(1).max(4).nullable().optional(),
  dueDate: z.string().date().nullable().optional(),
});

export const updateNodePositionSchema = z.object({
  nodeId: z.string().uuid(),
  x: z.number().finite(),
  y: z.number().finite(),
});

export const updateTaskStatusSchema = z.object({
  taskId: z.string().uuid(),
  // BLOCKED is deliberately excluded — only the Status Engine may set
  // it, never the client directly.
  status: z.enum(["READY", "IN_PROGRESS", "DONE", "CANCELLED"]),
});

export type CreateTaskInput = z.infer<typeof createTaskSchema>;
export type UpdateTaskInput = z.infer<typeof updateTaskSchema>;
export type UpdateNodePositionInput = z.infer<typeof updateNodePositionSchema>;
export type UpdateTaskStatusInput = z.infer<typeof updateTaskStatusSchema>;
