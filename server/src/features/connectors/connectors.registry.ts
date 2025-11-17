import { z } from 'zod';

export interface ConnectorDefinition {
  id: string;
  name: string;
  description: string;
  category: 'webhook' | 'code' | 'social' | 'data';
  configSchema: z.ZodTypeAny;
  secureFields?: string[];
}

export const connectorRegistry: ConnectorDefinition[] = [
  {
    id: 'webhook-receiver',
    name: 'Webhook Receiver',
    description: 'Accepts inbound HTTP payloads',
    category: 'webhook',
    configSchema: z.object({ secret: z.string().optional() }),
  },
  {
    id: 'github',
    name: 'GitHub',
    description: 'Interact with GitHub repositories',
    category: 'code',
    configSchema: z.object({
      token: z.string().min(1),
      repository: z.string().regex(/^[^/]+\/[^/]+$/, 'Use owner/repo format'),
      webhookSecret: z.string().min(1),
      events: z.array(z.string()).default(['push']),
    }),
    secureFields: ['token', 'webhookSecret'],
  },
  {
    id: 'zcash-viewkey',
    name: 'Zcash Viewing Key',
    description: 'Monitor shielded addresses using viewing keys',
    category: 'data',
    configSchema: z.object({
      address: z.string().min(1),
      viewingKey: z.string().min(1),
      label: z.string().optional(),
      rescanMode: z.enum(['yes', 'no', 'whenkeyisnew']).default('whenkeyisnew').optional(),
      startHeight: z.number().int().nonnegative().optional(),
    }),
    secureFields: ['viewingKey'],
  },
  {
    id: 'twitter',
    name: 'Twitter/X',
    description: 'Stream posts or mentions from Twitter/X',
    category: 'social',
    configSchema: z.object({ bearerToken: z.string().min(1), handle: z.string().min(1) }),
    secureFields: ['bearerToken'],
  },
  {
    id: 'custom-http',
    name: 'Custom HTTP',
    description: 'Call any REST API with custom headers',
    category: 'data',
    configSchema: z.object({
      baseUrl: z.string().url(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
  },
];

export const getConnectorDefinition = (id: string): ConnectorDefinition | undefined =>
  connectorRegistry.find((def) => def.id === id);
