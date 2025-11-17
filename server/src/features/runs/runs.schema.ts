import { z } from 'zod';

export const createRunSchema = z.object({
  body: z.object({
    workflowId: z.string().min(1),
    triggerId: z.string().optional(),
    payload: z.record(z.string(), z.any()).default({}),
  }),
});
