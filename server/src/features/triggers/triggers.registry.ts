import { z } from 'zod';

export interface TriggerDefinition {
  id: string;
  name: string;
  description: string;
  category: 'webhook' | 'schedule' | 'blockchain' | 'social' | 'code' | 'data';
  configSchema: z.ZodTypeAny;
}

export const triggerRegistry: TriggerDefinition[] = [
  {
    id: 'http-webhook',
    name: 'HTTP Webhook',
    description: 'Fire workflow when inbound webhook receives payload',
    category: 'webhook',
    configSchema: z.object({
      secret: z.string().optional(),
      path: z.string().min(1),
    }),
  },
  {
    id: 'zcash-transaction',
    name: 'Zcash Transaction',
    description: 'Listen for shielded transactions with specific memo or amount',
    category: 'blockchain',
    configSchema: z.object({
      memoPattern: z.string().optional(),
      minAmount: z.number().nonnegative().optional(),
      address: z.string().min(1).optional(),
      minConfirmations: z.number().int().min(0).default(1),
    }),
  },
  {
    id: 'schedule',
    name: 'Scheduler',
    description: 'Execute at cron or interval schedule',
    category: 'schedule',
    configSchema: z.object({ expression: z.string().min(1) }),
  },
  {
    id: 'twitter-post',
    name: 'Twitter Post',
    description: 'Trigger when account posts or mentions appear',
    category: 'social',
    configSchema: z.object({
      handle: z.string().min(1),
      filter: z.string().optional(),
      eventType: z.enum(['posts', 'mentions', 'all']).default('all'),
      pollIntervalSec: z.number().int().min(30).default(60),
    }),
  },
  {
    id: 'github-commit',
    name: 'GitHub Commit',
    description: 'Trigger when repository receives commits',
    category: 'code',
    configSchema: z.object({
      branch: z.string().default('main'),
      includePaths: z.array(z.string()).optional(),
      excludePaths: z.array(z.string()).optional(),
    }),
  },
  {
    id: 'custom-http-poll',
    name: 'Custom HTTP Poll',
    description: 'Periodically fetch records from an HTTP endpoint using a connector',
    category: 'data',
    configSchema: z.object({
      relativePath: z.string().default('/'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('GET'),
      headers: z.record(z.string(), z.string()).optional(),
      queryParams: z.record(z.string(), z.string()).optional(),
      body: z.record(z.string(), z.any()).optional(),
      recordsPath: z.string().optional(),
      pollIntervalSec: z.number().int().min(10).default(30),
      maxBatch: z.number().int().min(1).max(200).default(50),
    }),
  },
];

export const getTriggerDefinition = (id: string): TriggerDefinition | undefined =>
  triggerRegistry.find((def) => def.id === id);
