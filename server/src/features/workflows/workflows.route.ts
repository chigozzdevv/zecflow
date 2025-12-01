import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createWorkflowSchema, publishWorkflowSchema, deleteWorkflowSchema } from './workflows.schema';
import {
  createWorkflowHandler,
  listWorkflowsHandler,
  publishWorkflowHandler,
  getWorkflowSnippetHandler,
   getWorkflowGraphHandler,
   getWorkflowTraceHandler,
  deleteWorkflowHandler,
} from './workflows.controller';

const router = Router();

router.get('/', authenticate, listWorkflowsHandler);
router.post('/', authenticate, validate(createWorkflowSchema), createWorkflowHandler);
router.post('/:workflowId/publish', authenticate, validate(publishWorkflowSchema), publishWorkflowHandler);
router.get('/:workflowId/snippet', authenticate, getWorkflowSnippetHandler);
router.get('/:workflowId/graph', authenticate, getWorkflowGraphHandler);
router.get('/:workflowId/trace/:runId', authenticate, getWorkflowTraceHandler);
router.delete('/:workflowId', authenticate, validate(deleteWorkflowSchema), deleteWorkflowHandler);

export default router;
