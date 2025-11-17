import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { sendTransactionSchema, createWatcherSchema } from './zcash-execution.schema';
import { sendTransactionHandler, createWatcherHandler, listWatcherHandler } from './zcash-execution.controller';

const router = Router();

router.post('/send', authenticate, validate(sendTransactionSchema), sendTransactionHandler);
router.post('/watchers', authenticate, validate(createWatcherSchema), createWatcherHandler);
router.get('/watchers', authenticate, listWatcherHandler);

export default router;
