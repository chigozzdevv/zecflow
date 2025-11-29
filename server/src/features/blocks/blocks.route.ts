import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createBlockSchema, updateBlockSchema, deleteBlockSchema } from './blocks.schema';
import {
  createBlockHandler,
  listBlocksHandler,
  listBlockDefinitions,
  updateBlockHandler,
  deleteBlockHandler,
} from './blocks.controller';

const router = Router();

router.get('/definitions', listBlockDefinitions);
router.get('/', authenticate, listBlocksHandler);
router.post('/', authenticate, validate(createBlockSchema), createBlockHandler);
router.patch('/:blockId', authenticate, validate(updateBlockSchema), updateBlockHandler);
router.delete('/:blockId', authenticate, validate(deleteBlockSchema), deleteBlockHandler);
router.patch('/:blockId', authenticate, validate(updateBlockSchema), updateBlockHandler);

export default router;
