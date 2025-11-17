import { Router } from 'express';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createRunSchema } from './runs.schema';
import { createRunHandler, listRunsHandler } from './runs.controller';

const router = Router();

router.get('/', listRunsHandler);
router.post('/', validate(createRunSchema), createRunHandler);

export default router;
