import { z } from 'zod';

export const createWorkflowSchema = z.object({
  body: z.object({
    name: z.string().min(1),
    description: z.string().optional(),
    triggerId: z.string().optional(),
  }),
});

export const publishWorkflowSchema = z.object({
  params: z.object({ workflowId: z.string().min(1) }),
});

export const deleteWorkflowSchema = z.object({
  params: z.object({ workflowId: z.string().min(1) }),
});
