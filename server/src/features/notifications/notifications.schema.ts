import { z } from 'zod';

export const createNotificationSchema = z.object({
  body: z.object({
    channel: z.enum(['email', 'webhook']),
    target: z.string().min(1),
    template: z.string().min(1),
  }),
});
