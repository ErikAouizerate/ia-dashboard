import { z } from "zod";

export const createFeatureSchema = z.object({
  name: z.string().min(1),
  project: z.string().min(1),
  purpose: z.string().optional(),
  status: z.enum(["planned", "in_progress", "done", "abandoned"]).optional(),
  satisfaction: z.number().int().min(1).max(5).optional(),
  comment: z.string().optional(),
  tags: z.array(z.string()).optional(),
  timeSpentMin: z.number().int().nonnegative().optional(),
});
export type CreateFeatureDto = z.infer<typeof createFeatureSchema>;

export const updateFeatureSchema = createFeatureSchema.partial();
export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;