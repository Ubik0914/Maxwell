import { z } from "zod";

export const createProjectSchema = z.object({
  workspaceId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(100, "Project name must be 100 characters or fewer"),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .optional(),
});

export const updateProjectSchema = z.object({
  projectId: z.string().uuid(),
  name: z
    .string()
    .trim()
    .min(1, "Project name is required")
    .max(100, "Project name must be 100 characters or fewer")
    .optional(),
  description: z
    .string()
    .trim()
    .max(5000, "Description must be 5000 characters or fewer")
    .nullable()
    .optional(),
  /** Archiving is a verb here; the table records when it happened. */
  archived: z.boolean().optional(),
});

export type CreateProjectInput = z.infer<typeof createProjectSchema>;
export type UpdateProjectInput = z.infer<typeof updateProjectSchema>;
