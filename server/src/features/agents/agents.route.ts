import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createAgentSchema } from './agents.schema';
import { createAgentHandler, listAgentsHandler, activateAgentHandler } from './agents.controller';

const router = Router();

router.get('/', authenticate, listAgentsHandler);
router.post('/', authenticate, validate(createAgentSchema), createAgentHandler);
router.post('/:agentId/activate', authenticate, activateAgentHandler);

export default router;
