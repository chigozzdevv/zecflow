import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { listAuditHandler } from './audit.controller';

const router = Router();

router.get('/', authenticate, listAuditHandler);

export default router;
