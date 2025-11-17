import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createActionHandler, listActionsHandler, listActionDefinitions } from './actions.controller';
import { createActionSchema } from './actions.schema';

const router = Router();

router.get('/definitions', listActionDefinitions);
router.get('/', listActionsHandler);
router.post('/', authenticate, validate(createActionSchema), createActionHandler);

export default router;
