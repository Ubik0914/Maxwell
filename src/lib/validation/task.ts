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
  // Optional, because only a canvas knows where a task was dropped. A
  // caller without one — the CLI, the MCP server — leaves it out and
  // the route finds it a spot (see nextFreeSpot). It was required, and
  // that made `maxwell task add` impossible to satisfy.
  position: z
    .object({
      x: z.number().finite(),
      y: z.number().finite(),
    })
    .optional(),
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

/**
 * A parsed CSV import, as it reaches the server.
 *
 * The file was read and checked in the browser, where it is and where a
 * problem can be shown against the line that caused it. This is the
 * second check, of the things a caller's word cannot be taken for —
 * shape, count, lengths — because a server action is a public entrance
 * however it was reached last.
 *
 * `key` is only meaningful within one import: it is how a row says what
 * it waits on before anything has an id. The server turns keys into ids
 * and forgets them.
 */
export const importTasksSchema = z.object({
  storyId: z.string().uuid(),
  rows: z
    .array(
      z.object({
        key: z.string().min(1).max(200),
        title: z
          .string()
          .trim()
          .min(1, "Title is required")
          .max(200, "Title must be 200 characters or fewer"),
        description: z
          .string()
          .max(5000, "Description must be 5000 characters or fewer")
          .nullable(),
        dueDate: z.string().date().nullable(),
        priority: z.number().int().min(1).max(4).nullable(),
        x: z.number().finite(),
        y: z.number().finite(),
        after: z.array(z.string().min(1).max(200)).max(50),
        afterIds: z.array(z.string().uuid()).max(50),
      }),
    )
    // Capped in the same place the RPC caps it. One paste that asks for
    // more than this is a paste of the wrong file.
    .min(1, "There is nothing to import")
    .max(500, "That is more rows than one import can take"),
});

export type ImportTasksInput = z.infer<typeof importTasksSchema>;

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

/**
 * The whole order, not the one row that moved — see reorderNodes for
 * why. Capped so a malformed or hostile call can't ask the database to
 * renumber an unbounded list; a story with more than a thousand tasks
 * has a bigger problem than its sort order.
 */
export const reorderTasksSchema = z.object({
  storyId: z.string().uuid(),
  taskIds: z.array(z.string().uuid()).min(1).max(1000),
});

export type ReorderTasksInput = z.infer<typeof reorderTasksSchema>;
