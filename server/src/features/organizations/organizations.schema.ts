import { z } from 'zod';

export const organizationIdSchema = z.object({
  params: z.object({ organizationId: z.string().min(1) }),
});
