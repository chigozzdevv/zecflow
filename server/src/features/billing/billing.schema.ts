import { z } from 'zod';

export const addCreditsSchema = z.object({
  body: z.object({
    amount: z.number().int().positive().max(1000000),
    reason: z.string().max(500).optional(),
  }),
});