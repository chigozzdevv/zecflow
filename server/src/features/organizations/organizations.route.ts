import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { getOrganization } from './organizations.controller';

const router = Router();

router.get('/current', authenticate, getOrganization);

export default router;
