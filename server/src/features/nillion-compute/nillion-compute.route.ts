import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { registerWorkloadSchema } from './nillion-compute.schema';
import { registerWorkloadHandler, listWorkloadsHandler } from './nillion-compute.controller';

const router = Router();

router.get('/workloads', authenticate, listWorkloadsHandler);
router.post('/workloads', authenticate, validate(registerWorkloadSchema), registerWorkloadHandler);

export default router;
