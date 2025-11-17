import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createTriggerSchema } from './triggers.schema';
import {
  createTriggerHandler,
  listTriggersHandler,
  listTriggerDefinitions,
  triggerWebhookHandler,
  testTriggerHandler,
} from './triggers.controller';

const router = Router();

router.get('/definitions', authenticate, listTriggerDefinitions);
router.get('/', authenticate, listTriggersHandler);
router.post('/', authenticate, validate(createTriggerSchema), createTriggerHandler);
router.post('/:triggerId/test', authenticate, testTriggerHandler);
router.post('/hooks/:triggerId', triggerWebhookHandler);

export default router;
