import { z } from 'zod';

export const createAgentSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    workflowId: z.string().min(1),
  }),
});
