import { z } from 'zod';

export const createBlockSchema = z.object({
  body: z.object({
    workflowId: z.string().min(1),
    type: z.string().min(1),
    config: z.record(z.string(), z.any()).default({}),
    position: z.object({ x: z.number().default(0), y: z.number().default(0) }).optional(),
    order: z.number().nonnegative().default(0),
    alias: z.string().optional(),
    dependencies: z.array(z.string()).default([]),
    connectorId: z.string().optional(),
  }),
});

export const updateBlockSchema = z.object({
  params: z.object({
    blockId: z.string().min(1),
  }),
  body: z.object({
    position: z
      .object({
        x: z.number(),
        y: z.number(),
      })
      .optional(),
    dependencies: z.array(z.string()).optional(),
    alias: z.string().optional(),
    config: z.record(z.string(), z.any()).optional(),
  }),
});

export const deleteBlockSchema = z.object({
  params: z.object({
    blockId: z.string().min(1),
  }),
});
