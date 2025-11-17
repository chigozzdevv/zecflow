import { z } from 'zod';

export interface ActionDefinition {
  id: string;
  name: string;
  description: string;
  handler: 'zcash' | 'notification' | 'connector';
  configSchema: z.ZodTypeAny;
}

export const actionRegistry: ActionDefinition[] = [
  {
    id: 'zcash-transfer',
    name: 'Zcash Transfer',
    description: 'Send shielded funds to a recipient',
    handler: 'zcash',
    configSchema: z.object({
      address: z.string().min(1),
      amount: z.number().positive(),
      memo: z.string().optional(),
    }),
  },
  {
    id: 'notify-user',
    name: 'Notification',
    description: 'Send email or webhook notification',
    handler: 'notification',
    configSchema: z.object({
      channel: z.enum(['email', 'webhook']),
      target: z.string().min(1),
      template: z.string().min(1),
    }),
  },
  {
    id: 'custom-http-action',
    name: 'Custom HTTP Action',
    description: 'Invoke arbitrary HTTP endpoint',
    handler: 'connector',
    configSchema: z.object({
      method: z.enum(['GET', 'POST', 'PUT', 'PATCH', 'DELETE']).default('POST'),
      url: z.string().url(),
      headers: z.record(z.string(), z.string()).optional(),
    }),
  },
];

export function getActionDefinition(id: string): ActionDefinition | undefined {
  return actionRegistry.find((action) => action.id === id);
}
