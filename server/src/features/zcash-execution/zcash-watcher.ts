import { Types } from 'mongoose';
import { TriggerModel } from '@/features/triggers/triggers.model';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';
import { zcashService, ViewingKeyRescanMode } from '@/shared/services/zcash.service';
import { logger } from '@/utils/logger';
import { createRun } from '@/features/runs/runs.service';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { ZcashTriggerStateModel, ZcashTriggerStateDocument } from './zcash-trigger-state.model';

const POLL_INTERVAL_MS = 30_000;
const MAX_TRACKED_TXIDS = 200;
const importedViewingKeys = new Set<string>();

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

const ensureViewingKey = async (
  viewingKey?: string,
  rescanMode?: ViewingKeyRescanMode,
  startHeight?: number,
): Promise<void> => {
  if (!viewingKey || importedViewingKeys.has(viewingKey)) {
    return;
  }
  await zcashService.importViewingKey(viewingKey, rescanMode ?? 'whenkeyisnew', startHeight);
  importedViewingKeys.add(viewingKey);
};

const loadTriggerStates = async (triggerIds: string[]): Promise<Map<string, ZcashTriggerStateDocument>> => {
  const records = triggerIds.length
    ? await ZcashTriggerStateModel.find({ trigger: { $in: triggerIds } })
    : [];
  const map = new Map<string, ZcashTriggerStateDocument>();
  records.forEach((state) => map.set(state.trigger.toString(), state));
  return map;
};

const loadConnectorMap = async (
  connectorIds: string[],
): Promise<Map<string, { type: string; config: Record<string, unknown> }>> => {
  if (!connectorIds.length) {
    return new Map();
  }
  const connectors = await ConnectorModel.find({ _id: { $in: connectorIds } });
  const map = new Map<string, { type: string; config: Record<string, unknown> }>();
  connectors.forEach((connector) => {
    map.set(connector.id, {
      type: connector.type,
      config: decryptConnectorConfig(connector.type, connector.config as Record<string, unknown>),
    });
  });
  return map;
};

const pollZcash = async (): Promise<void> => {
  const triggers = await TriggerModel.find({ type: 'zcash-transaction', status: 'active' });
  if (!triggers.length) {
    return;
  }

  const triggerIds = triggers.map((trigger) => (trigger._id as Types.ObjectId).toString());
  const stateMap = await loadTriggerStates(triggerIds);

  const connectorIds = [...new Set(triggers.map((t) => t.connector?.toString()).filter(Boolean) as string[])];
  const connectorMap = await loadConnectorMap(connectorIds);

  for (const trigger of triggers) {
    const config = trigger.config as Record<string, unknown>;
    const memoPattern = config.memoPattern as string | undefined;
    const minAmount = config.minAmount as number | undefined;
    const minConfirmations = (config.minConfirmations as number | undefined) ?? 1;

    const connectorInfo = trigger.connector ? connectorMap.get(trigger.connector.toString()) : undefined;
    const connectorAddress = connectorInfo?.config.address as string | undefined;
    const viewingKey = connectorInfo?.config.viewingKey as string | undefined;
    const rescanMode = connectorInfo?.config.rescanMode as ViewingKeyRescanMode | undefined;
    const startHeight = connectorInfo?.config.startHeight as number | undefined;

    const address = (config.address as string | undefined) ?? connectorAddress;
    if (!address) {
      continue;
    }

    try {
      await ensureViewingKey(viewingKey, rescanMode, startHeight);

      const received = await zcashService.call<any[]>('z_listreceivedbyaddress', [address, minConfirmations]);
      const workflow = await WorkflowModel.findOne({ trigger: trigger.id, status: 'published' });
      if (!workflow) {
        continue;
      }

      let state = stateMap.get(trigger.id);
      if (!state) {
        state = new ZcashTriggerStateModel({
          trigger: trigger._id as Types.ObjectId,
          lastBlockHeight: 0,
          processedTxIds: [],
        });
        stateMap.set(trigger.id, state);
      }

      const processedSet = new Set(state.processedTxIds ?? []);
      let highestBlockHeight = state.lastBlockHeight ?? 0;
      let stateChanged = false;

      const orderedTxs = [...received].sort(
        (a, b) => (a.blockheight ?? 0) - (b.blockheight ?? 0),
      );

      for (const tx of orderedTxs) {
        if (tx.change) {
          continue;
        }

        const memoDecoded = tx.memoStr ?? decodeMemo(tx.memo);
        if (memoPattern && memoDecoded && !memoDecoded.includes(memoPattern)) {
          continue;
        }

        if (minAmount && Number(tx.amount) < minAmount) {
          continue;
        }

        if (processedSet.has(tx.txid)) {
          continue;
        }

        const blockheight = tx.blockheight ?? 0;
        if (blockheight && blockheight < state.lastBlockHeight) {
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
            pool: tx.pool,
            blockheight,
            blocktime: tx.blocktime,
          },
        });

        processedSet.add(tx.txid);
        stateChanged = true;
        if (blockheight > highestBlockHeight) {
          highestBlockHeight = blockheight;
        }
      }

      if (stateChanged) {
        state.lastBlockHeight = highestBlockHeight;
        state.processedTxIds = Array.from(processedSet).slice(-MAX_TRACKED_TXIDS);
        await state.save();
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
