import { z } from 'zod';

export const registerWorkloadSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    workloadId: z.string().min(1).optional(),
    description: z.string().optional(),
    config: z.record(z.string(), z.any()).default({}),
  }),
});
