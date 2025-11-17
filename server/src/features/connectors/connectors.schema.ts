import { z } from 'zod';

export const createConnectorSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    type: z.string().min(1),
    config: z.record(z.string(), z.any()).default({}),
  }),
});
