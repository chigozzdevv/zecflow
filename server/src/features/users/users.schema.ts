import { z } from 'zod';

export const getUserParamsSchema = z.object({
  params: z.object({ userId: z.string().min(1) }),
});
