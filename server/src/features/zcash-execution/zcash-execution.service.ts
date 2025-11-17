import { zcashService, ZcashPrivacyPolicy } from '@/shared/services/zcash.service';

interface SendShieldedTransferInput {
  address: string;
  amount: number | string;
  memo?: string;
  fromAddress?: string;
  minConfirmations?: number;
  fee?: number;
  privacyPolicy?: ZcashPrivacyPolicy;
  timeoutMs?: number;
}

export const sendShieldedTransfer = async (input: SendShieldedTransferInput) => {
  return zcashService.sendShieldedTransaction(input.address, input.amount, {
    memo: input.memo,
    fromAddress: input.fromAddress,
    minConfirmations: input.minConfirmations,
    fee: input.fee ?? null,
    privacyPolicy: input.privacyPolicy,
    timeoutMs: input.timeoutMs,
  });
};
