import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { addCreditsSchema } from './billing.schema';
import {
  getCreditsHandler,
  addCreditsHandler,
  getCreditCostsHandler,
  getTransactionHistoryHandler,
} from './billing.controller';

const router = Router();

router.get('/credits', authenticate, getCreditsHandler);
router.post('/credits', authenticate, validate(addCreditsSchema), addCreditsHandler);
router.get('/costs', authenticate, getCreditCostsHandler);
router.get('/transactions', authenticate, getTransactionHistoryHandler);

export default router;