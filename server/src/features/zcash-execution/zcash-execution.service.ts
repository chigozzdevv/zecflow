import { zcashService } from '@/shared/services/zcash.service';
import { ZcashJobModel } from './zcash-execution.model';

export const sendShieldedTransfer = (address: string, amount: number, memo?: string) => {
  return zcashService.sendShieldedTransaction(address, amount, memo);
};

interface CreateWatcherInput {
  organizationId: string;
  userId: string;
  config: Record<string, unknown>;
}

export const createTransactionWatcher = (input: CreateWatcherInput) => {
  return ZcashJobModel.create({
    type: 'transaction-monitor',
    config: input.config,
    organization: input.organizationId,
    createdBy: input.userId,
  });
};

export const listWatchers = (organizationId: string) => {
  return ZcashJobModel.find({ organization: organizationId, type: 'transaction-monitor' }).lean();
};
