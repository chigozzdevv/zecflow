import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createRunSchema } from './runs.schema';
import { createRunHandler, listRunsHandler } from './runs.controller';

const router = Router();

router.get('/', authenticate, listRunsHandler);
router.post('/', authenticate, validate(createRunSchema), createRunHandler);

export default router;
