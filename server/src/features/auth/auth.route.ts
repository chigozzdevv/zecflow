import { Router } from 'express';
import { validate } from '@/shared/middlewares/validation.middleware';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { registerSchema, loginSchema } from './auth.schema';
import { registerHandler, loginHandler, getMe } from './auth.controller';
import { getOrganization } from '@/features/organizations/organizations.controller';

const router = Router();

router.post('/register', validate(registerSchema), registerHandler);
router.post('/login', validate(loginSchema), loginHandler);
router.get('/me', authenticate, getMe);
router.get('/organization', authenticate, getOrganization);

export default router;
