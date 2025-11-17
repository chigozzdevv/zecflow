import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createBlockSchema } from './blocks.schema';
import { createBlockHandler, listBlocksHandler, listBlockDefinitions } from './blocks.controller';

const router = Router();

router.get('/definitions', listBlockDefinitions);
router.get('/', authenticate, listBlocksHandler);
router.post('/', authenticate, validate(createBlockSchema), createBlockHandler);

export default router;
