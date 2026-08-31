import { z } from "zod";

export const createFeatureSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1),
  purpose: z.string().optional(),
  satisfaction: z.number().int().min(1).max(5).nullable().optional(),
  comment: z.string().optional(),
  tags: z.array(z.string()).optional(),
  timeSpentMin: z.number().int().nonnegative().nullable().optional(),
});
export type CreateFeatureDto = z.infer<typeof createFeatureSchema>;

export const updateFeatureSchema = createFeatureSchema.partial();
export type UpdateFeatureDto = z.infer<typeof updateFeatureSchema>;