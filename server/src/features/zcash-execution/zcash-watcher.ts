import { TriggerModel } from '@/features/triggers/triggers.model';
import { zcashService } from '@/shared/services/zcash.service';
import { logger } from '@/utils/logger';
import { createRun } from '@/features/runs/runs.service';
import { WorkflowModel } from '@/features/workflows/workflows.model';

const processedTxs = new Map<string, Set<string>>();
const POLL_INTERVAL_MS = 30_000;

const decodeMemo = (hex?: string): string | undefined => {
  if (!hex) {
    return undefined;
  }
  try {
    const buffer = Buffer.from(hex.replace(/00+$/g, ''), 'hex');
    return buffer.toString('utf8').replace(/\u0000+/g, '').trim();
  } catch {
    return undefined;
  }
};

const shouldProcess = (
  triggerId: string,
  txid: string,
): boolean => {
  const existing = processedTxs.get(triggerId) ?? new Set<string>();
  if (existing.has(txid)) {
    return false;
  }
  existing.add(txid);
  processedTxs.set(triggerId, existing);
  return true;
};

const pollZcash = async (): Promise<void> => {
  const triggers = await TriggerModel.find({ type: 'zcash-transaction', status: 'active' });
  for (const trigger of triggers) {
    const config = trigger.config as Record<string, unknown>;
    const address = (config.address as string) ?? null;
    if (!address) {
      continue;
    }
    try {
      const received = await zcashService.call<any[]>('z_listreceivedbyaddress', [address, 0]);
      const memoPattern = config.memoPattern as string | undefined;
      const minAmount = config.minAmount as number | undefined;
      const workflow = await WorkflowModel.findOne({ trigger: trigger.id, status: 'published' });
      if (!workflow) {
        continue;
      }
      for (const tx of received) {
        const memoDecoded = decodeMemo(tx.memo);
        if (memoPattern && memoDecoded && !memoDecoded.includes(memoPattern)) {
          continue;
        }
        if (minAmount && Number(tx.amount) < minAmount) {
          continue;
        }
        if (!shouldProcess(trigger.id, tx.txid)) {
          continue;
        }
        await createRun({
          workflowId: workflow.id,
          triggerId: trigger.id,
          payload: {
            txid: tx.txid,
            amount: tx.amount,
            memo: memoDecoded,
            address: tx.address,
            confirmations: tx.confirmations,
          },
        });
      }
    } catch (error) {
      logger.error({ err: error, triggerId: trigger.id }, 'Failed to poll Zcash transactions');
    }
  }
};

let intervalHandle: NodeJS.Timeout | null = null;

export const startZcashWatcher = (): void => {
  if (intervalHandle) {
    return;
  }
  intervalHandle = setInterval(() => {
    pollZcash().catch((error) => logger.error({ err: error }, 'Zcash watcher error'));
  }, POLL_INTERVAL_MS);
  logger.info('Zcash watcher started');
};

export const stopZcashWatcher = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
