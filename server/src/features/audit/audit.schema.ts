import { z } from 'zod';

export const listAuditSchema = z.object({
  query: z.object({ limit: z.coerce.number().min(1).max(100).default(20) }).partial(),
});
