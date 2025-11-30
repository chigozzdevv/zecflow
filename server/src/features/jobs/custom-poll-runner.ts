import axios, { AxiosRequestConfig } from 'axios';
import crypto from 'crypto';
import { TriggerModel } from '@/features/triggers/triggers.model';
import { WorkflowModel } from '@/features/workflows/workflows.model';
import { ConnectorModel } from '@/features/connectors/connectors.model';
import { decryptConnectorConfig } from '@/features/connectors/connectors.security';
import { createRun } from '@/features/runs/runs.service';
import { logger } from '@/utils/logger';

const lastPolledAt = new Map<string, number>();
const lastSeenState = new Map<string, Map<string, string>>();
const DEFAULT_INTERVAL_MS = 30_000;

const extractRecords = (payload: unknown, path?: string): unknown[] => {
  if (!path) {
    return Array.isArray(payload) ? payload : [];
  }
  const segments = path.split('.').filter(Boolean);
  let current: any = payload;
  for (const segment of segments) {
    if (current && typeof current === 'object' && segment in current) {
      current = (current as Record<string, unknown>)[segment];
    } else {
      return [];
    }
  }
  return Array.isArray(current) ? current : [];
};

const getNestedValue = (obj: any, path: string): any => {
  if (!path) return obj;
  return path.split('.').reduce((acc, part) => (acc && acc[part] !== undefined ? acc[part] : undefined), obj);
};

const computeHash = (value: any): string => {
  const str = typeof value === 'object' ? JSON.stringify(value) : String(value);
  return crypto.createHash('sha256').update(str).digest('hex');
};

const evaluateCondition = (leftValue: any, operator: string, rightValue: any): boolean => {
  switch (operator) {
    case 'equals':
      return leftValue === rightValue;
    case 'not_equals':
      return leftValue !== rightValue;
    case 'gt':
      return Number(leftValue) > Number(rightValue);
    case 'lt':
      return Number(leftValue) < Number(rightValue);
    case 'gte':
      return Number(leftValue) >= Number(rightValue);
    case 'lte':
      return Number(leftValue) <= Number(rightValue);
    case 'contains':
      return String(leftValue).includes(String(rightValue));
    case 'not_contains':
      return !String(leftValue).includes(String(rightValue));
    case 'exists':
      return leftValue !== undefined && leftValue !== null;
    case 'not_exists':
      return leftValue === undefined || leftValue === null;
    default:
      return false;
  }
};

const hasChanged = (
  triggerId: string,
  record: Record<string, any>,
  recordIdPath?: string,
  watchFields?: string[],
): boolean => {
  const recordId = recordIdPath ? String(getNestedValue(record, recordIdPath)) : JSON.stringify(record);
  const stateKey = `${triggerId}:${recordId}`;

  if (!lastSeenState.has(triggerId)) {
    lastSeenState.set(triggerId, new Map());
  }

  const triggerState = lastSeenState.get(triggerId)!;

  if (watchFields && watchFields.length > 0) {
    const watchedValues = watchFields.map((field) => getNestedValue(record, field));
    const currentHash = computeHash(watchedValues);
    const previousHash = triggerState.get(stateKey);

    if (previousHash === currentHash) {
      return false;
    }

    triggerState.set(stateKey, currentHash);
    return previousHash !== undefined;
  } else {
    const currentHash = computeHash(record);
    const previousHash = triggerState.get(stateKey);

    if (previousHash === currentHash) {
      return false;
    }

    triggerState.set(stateKey, currentHash);
    return true;
  }
};

const pollCustomHttpTriggers = async (): Promise<void> => {
  const triggers = await TriggerModel.find({ type: 'custom-http-poll', status: 'active' }).lean();
  for (const trigger of triggers) {
    if (!trigger.connector) {
      logger.warn({ triggerId: trigger._id }, 'Custom HTTP poll trigger missing connector');
      continue;
    }
    const connector = await ConnectorModel.findById(trigger.connector).lean();
    if (!connector) {
      continue;
    }
    const workflow = await WorkflowModel.findOne({ trigger: trigger._id, status: 'published' }).lean();
    if (!workflow) {
      continue;
    }

    const now = Date.now();
    const pollIntervalSec = (trigger.config as Record<string, unknown>).pollIntervalSec as number | undefined;
    const interval = Math.max((pollIntervalSec ?? 30) * 1000, 10_000);
    const last = lastPolledAt.get(trigger._id.toString()) ?? 0;
    if (now - last < interval) {
      continue;
    }

    const connectorConfig = decryptConnectorConfig(connector.type, connector.config as Record<string, unknown>);
    const baseUrl = connectorConfig.baseUrl as string;
    if (!baseUrl) {
      logger.warn({ connectorId: connector._id }, 'Connector missing baseUrl');
      continue;
    }

    const triggerConfig = trigger.config as Record<string, unknown>;
    const relativePath = (triggerConfig.relativePath as string) ?? '/';
    const method = (triggerConfig.method as string) ?? 'GET';
    const triggerHeaders = triggerConfig.headers as Record<string, string> | undefined;
    const headers = {
      ...(connectorConfig.headers as Record<string, string> | undefined),
      ...(triggerHeaders ?? {}),
    };
    const recordPath = triggerConfig.recordsPath as string | undefined;
    const params = triggerConfig.queryParams as Record<string, string> | undefined;
    const body = triggerConfig.body as Record<string, unknown> | undefined;
    
    let url: string;
    const trimmedBase = baseUrl.endsWith('/') ? baseUrl.slice(0, -1) : baseUrl;
    const trimmedPath = relativePath.startsWith('/') ? relativePath.slice(1) : relativePath;
    url = trimmedPath ? `${trimmedBase}/${trimmedPath}` : trimmedBase;

    const recordIdPath = triggerConfig.recordIdPath as string | undefined;
    const watchFields = triggerConfig.watchFields as string[] | undefined;
    const changeDetection = triggerConfig.changeDetection as boolean | undefined;

    const conditionField = triggerConfig.conditionField as string | undefined;
    const conditionOperator = triggerConfig.conditionOperator as string | undefined;
    const conditionValue = triggerConfig.conditionValue;

    try {
      const requestConfig: AxiosRequestConfig = { method, url, headers, params, data: body };
      const response = await axios.request(requestConfig);
      lastPolledAt.set(trigger._id.toString(), now);

      const records = extractRecords(response.data, recordPath);
      const maxBatch = (trigger.config as Record<string, unknown>).maxBatch as number | undefined;
      const batch = maxBatch ? records.slice(0, maxBatch) : records;

      let triggeredCount = 0;

      for (const record of batch) {
        if (conditionField && conditionOperator) {
          const fieldValue = getNestedValue(record, conditionField);
          if (!evaluateCondition(fieldValue, conditionOperator, conditionValue)) {
            continue;
          }
        }

        if (changeDetection !== false) {
          const changed = hasChanged(trigger._id.toString(), record as Record<string, any>, recordIdPath, watchFields);
          if (!changed) {
            continue;
          }
        }

        await createRun({
          workflowId: workflow._id.toString(),
          triggerId: trigger._id.toString(),
          payload: record as Record<string, unknown>,
        });

        triggeredCount++;
      }

      if (triggeredCount > 0) {
        logger.info({ triggerId: trigger._id, count: triggeredCount }, 'Custom poll triggered workflows');
      }
    } catch (error) {
      logger.error({ err: error, triggerId: trigger._id }, 'Custom HTTP poll failed');
    }
  }
};

let intervalHandle: NodeJS.Timeout | null = null;

export const startCustomPollRunner = (): void => {
  if (intervalHandle) {
    return;
  }
  intervalHandle = setInterval(() => {
    pollCustomHttpTriggers().catch((error) => logger.error({ err: error }, 'Custom poll runner error'));
  }, DEFAULT_INTERVAL_MS);
  logger.info('Custom HTTP poll runner started');
};

export const stopCustomPollRunner = (): void => {
  if (intervalHandle) {
    clearInterval(intervalHandle);
    intervalHandle = null;
  }
};
