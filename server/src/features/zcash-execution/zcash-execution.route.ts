import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { sendTransactionSchema } from './zcash-execution.schema';
import { sendTransactionHandler } from './zcash-execution.controller';

const router = Router();

router.post('/send', authenticate, validate(sendTransactionSchema), sendTransactionHandler);

export default router;
