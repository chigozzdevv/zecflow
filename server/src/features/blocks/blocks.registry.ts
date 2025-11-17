import { z } from 'zod';
import { BlockHandlerType } from './blocks.types';

type BlockCategory = 'input' | 'condition' | 'compute' | 'action' | 'storage' | 'transform';

export interface BlockDefinition {
  id: string;
  name: string;
  description: string;
  category: BlockCategory;
  handler: BlockHandlerType;
  configSchema: z.ZodTypeAny;
  requiresConnector?: boolean;
}

const valuePathSchema = z.string().min(1, 'Use dot notation paths');
const conditionalFields = {
  runIfPath: z.string().optional(),
  runIfEquals: z.union([z.string(), z.number(), z.boolean()]).optional(),
};
const withCondition = (schema: z.ZodObject<any, any>) => schema.merge(z.object(conditionalFields));

export const blockRegistry: BlockDefinition[] = [
  {
    id: 'payload-input',
    name: 'Payload Input',
    description: 'Capture trigger payload or a nested path',
    category: 'input',
    handler: 'logic',
    configSchema: withCondition(z.object({
      path: z.string().optional(),
      alias: z.string().optional(),
    })),
  },
  {
    id: 'json-extract',
    name: 'JSON Extract',
    description: 'Extract a value from payload or memory and store it under an alias',
    category: 'transform',
    handler: 'logic',
    configSchema: withCondition(z.object({
      source: z.enum(['payload', 'memory']).default('payload'),
      path: valuePathSchema,
      alias: z.string().min(1),
    })),
  },
  {
    id: 'memo-parser',
    name: 'Zcash Memo Parser',
    description: 'Parse structured memo text into key/value pairs',
    category: 'transform',
    handler: 'logic',
    configSchema: withCondition(z.object({
      sourcePath: valuePathSchema,
      delimiter: z.string().default(':'),
      alias: z.string().min(1),
    })),
  },
  {
    id: 'branch-gateway',
    name: 'Branch Gateway',
    description: 'Evaluate a condition and expose a boolean alias for branching logic',
    category: 'condition',
    handler: 'logic',
    configSchema: withCondition(z.object({
      leftPath: valuePathSchema,
      operator: z.enum(['equals', 'not_equals', 'gt', 'lt', 'includes']),
      rightValue: z.union([z.string(), z.number(), z.boolean()]),
      alias: z.string().min(1),
    })),
  },
  {
    id: 'math-operation',
    name: 'Math Operation',
    description: 'Perform arithmetic on two numeric inputs and store the result',
    category: 'transform',
    handler: 'logic',
    configSchema: withCondition(z.object({
      leftPath: valuePathSchema,
      rightPath: valuePathSchema,
      operation: z.enum(['add', 'subtract', 'multiply', 'divide']),
      alias: z.string().min(1),
    })),
  },
  {
    id: 'nillion-compute',
    name: 'Nillion Compute',
    description: 'Execute private compute workload with secret inputs',
    category: 'compute',
    handler: 'nillion',
    configSchema: withCondition(z.object({
      workloadId: z.string().min(1),
      inputPath: z.string().optional(),
      alias: z.string().min(1),
    })),
  },
  {
    id: 'nillion-block-graph',
    name: 'Nillion Block Graph',
    description: 'Execute visual Nillion blocks (math, logic, etc.) in TEE',
    category: 'compute',
    handler: 'nillion',
    configSchema: withCondition(z.object({
      nillionGraph: z.object({
        nodes: z.array(z.any()),
        edges: z.array(z.any()),
      }),
      inputMapping: z.record(z.string(), z.string()).optional(),
      alias: z.string().min(1),
    })),
  },
  {
    id: 'nilai-llm',
    name: 'NilAI Reasoning',
    description: 'Invoke NilAI LLM with templated prompts',
    category: 'compute',
    handler: 'nilai',
    configSchema: withCondition(z.object({
      model: z.string().default('default'),
      promptTemplate: z.string().min(1),
      alias: z.string().min(1),
    })),
  },
  {
    id: 'zcash-send',
    name: 'Zcash Transfer',
    description: 'Send shielded transaction using workflow data',
    category: 'action',
    handler: 'zcash',
    configSchema: withCondition(z.object({
      addressPath: valuePathSchema.optional(),
      amountPath: valuePathSchema,
      memoPath: valuePathSchema.optional(),
      fallbackAddress: z.string().optional(),
    })),
  },
  {
    id: 'connector-request',
    name: 'Connector Request',
    description: 'Call a configured connector REST endpoint',
    category: 'action',
    handler: 'connector',
    requiresConnector: true,
    configSchema: withCondition(z.object({
      relativePath: z.string().default('/'),
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
      bodyPath: z.string().optional(),
      responseAlias: z.string().optional(),
      headers: z.record(z.string(), z.string()).optional(),
    })),
  },
  {
    id: 'custom-http-action',
    name: 'Custom HTTP Action',
    description: 'Call arbitrary HTTP endpoint with workflow data',
    category: 'action',
    handler: 'connector',
    configSchema: withCondition(z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
      url: z.string().url(),
      headers: z.record(z.string(), z.string()).optional(),
      bodyPath: z.string().optional(),
      responseAlias: z.string().optional(),
    })),
  },
  {
    id: 'state-store',
    name: 'State Store',
    description: 'Persist state to Nillion storage collection',
    category: 'storage',
    handler: 'nillion',
    configSchema: withCondition(z.object({
      collectionId: z.string().min(1),
      keyPath: z.string().optional(),
      dataPath: z.string().optional(),
      alias: z.string().optional(),
    })),
  },
  {
    id: 'state-read',
    name: 'State Read',
    description: 'Fetch private state from Nillion storage',
    category: 'storage',
    handler: 'nillion',
    configSchema: withCondition(z.object({
      collectionId: z.string().min(1),
      keyPath: valuePathSchema,
      alias: z.string().min(1),
    })),
  },
];

export const getBlockDefinition = (id: string): BlockDefinition | undefined =>
  blockRegistry.find((def) => def.id === id);
