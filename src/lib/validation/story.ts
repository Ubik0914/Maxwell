import { z } from "zod";

export const createStorySchema = z.object({
  workspaceId: z.string().uuid(),
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
  startState: z
    .string()
    .trim()
    .min(1, "Start State is required")
    .max(200, "Start State must be 200 characters or fewer"),
  goalState: z
    .string()
    .trim()
    .min(1, "Goal State is required")
    .max(200, "Goal State must be 200 characters or fewer"),
});

export type CreateStoryInput = z.infer<typeof createStorySchema>;
