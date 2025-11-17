import { Response } from 'express';
import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { sendShieldedTransfer } from './zcash-execution.service';

export const sendTransactionHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }

  const { address, amount, memo, fromAddress, minConfirmations, fee, privacyPolicy, timeoutMs } = req.body;
  const result = await sendShieldedTransfer({
    address,
    amount,
    memo,
    fromAddress,
    minConfirmations,
    fee,
    privacyPolicy,
    timeoutMs,
  });

  res.json(result);
};
