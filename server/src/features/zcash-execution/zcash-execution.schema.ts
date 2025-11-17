import { z } from 'zod';

const privacyPolicySchema = z.enum([
  'FullPrivacy',
  'LegacyCompat',
  'AllowRevealedAmounts',
  'AllowRevealedRecipients',
  'AllowRevealedSenders',
  'AllowFullyTransparent',
  'AllowLinkingAccountAddresses',
  'NoPrivacy',
]);

const amountSchema = z
  .union([z.number(), z.string().regex(/^-?\d+(\.\d+)?$/, 'Invalid amount format')])
  .refine((value) => {
    const numeric = typeof value === 'number' ? value : Number(value);
    return Number.isFinite(numeric) && numeric > 0;
  }, 'Amount must be positive');

export const sendTransactionSchema = z.object({
  body: z.object({
    address: z.string().min(1),
    amount: amountSchema,
    memo: z.string().optional(),
    fromAddress: z.string().min(1).optional(),
    minConfirmations: z.number().int().min(0).optional(),
    fee: z.number().positive().optional(),
    privacyPolicy: privacyPolicySchema.optional(),
    timeoutMs: z.number().int().positive().max(600_000).optional(),
  }),
});
