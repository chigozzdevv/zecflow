import { Router } from 'express';
import { authenticate } from '@/shared/middlewares/auth.middleware';
import { validate } from '@/shared/middlewares/validation.middleware';
import { createNotificationSchema } from './notifications.schema';
import { createNotificationHandler, listNotificationsHandler } from './notifications.controller';

const router = Router();

router.get('/', authenticate, listNotificationsHandler);
router.post('/', authenticate, validate(createNotificationSchema), createNotificationHandler);

export default router;
