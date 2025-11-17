import { z } from 'zod';

export const createActionSchema = z.object({
  body: z.object({
    workflowId: z.string().min(1),
    type: z.string().min(1),
    config: z.record(z.string(), z.any()).default({}),
  }),
});
