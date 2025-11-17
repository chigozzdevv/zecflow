import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createWorkflowSchema, publishWorkflowSchema } from './workflows.schema';
import { createWorkflowHandler, listWorkflowsHandler, publishWorkflowHandler } from './workflows.controller';

const router = Router();

router.get('/', authenticate, listWorkflowsHandler);
router.post('/', authenticate, validate(createWorkflowSchema), createWorkflowHandler);
router.post('/:workflowId/publish', authenticate, validate(publishWorkflowSchema), publishWorkflowHandler);

export default router;
