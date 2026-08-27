import { z } from "zod";

export const createEdgeSchema = z.object({
  storyId: z.string().uuid(),
  sourceNodeId: z.string().uuid(),
  targetNodeId: z.string().uuid(),
});

export const insertTaskOnEdgeSchema = z.object({
  edgeId: z.string().uuid(),
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
});

export type CreateEdgeInput = z.infer<typeof createEdgeSchema>;
export type InsertTaskOnEdgeInput = z.infer<typeof insertTaskOnEdgeSchema>;
