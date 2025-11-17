import { z } from 'zod';

export const sendTransactionSchema = z.object({
  body: z.object({
    address: z.string().min(1),
    amount: z.number().positive(),
    memo: z.string().optional(),
  }),
});

export const createWatcherSchema = z.object({
  body: z.object({
    memoPattern: z.string().optional(),
    minAmount: z.number().nonnegative().optional(),
  }),
});
