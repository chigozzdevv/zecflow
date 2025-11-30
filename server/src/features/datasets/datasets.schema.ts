import { z } from 'zod';

export const createDatasetSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    schema: z.unknown(),
  }),
});

export const updateDatasetSchema = z.object({
  params: z.object({ datasetId: z.string().min(1) }),
  body: z.object({
    name: z.string().min(1).optional(),
    schema: z.unknown().optional(),
  }),
});

export const datasetIdParamSchema = z.object({
  params: z.object({ datasetId: z.string().min(1) }),
});
