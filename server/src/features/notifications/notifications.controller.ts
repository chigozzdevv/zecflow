import { AuthenticatedRequest } from '@/shared/middlewares/auth.middleware';
import { HttpStatus } from '@/utils/http-status';
import { Response } from 'express';
import { findUserById } from '@/features/users/users.service';
import { createNotificationPreference, listNotificationPreferences } from './notifications.service';

export const createNotificationHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const notification = await createNotificationPreference({
    channel: req.body.channel,
    target: req.body.target,
    template: req.body.template,
    organizationId: user.organization.toString(),
    userId: user.id,
  });
  res.status(HttpStatus.CREATED).json({ notification });
};

export const listNotificationsHandler = async (req: AuthenticatedRequest, res: Response): Promise<void> => {
  if (!req.user) {
    res.status(HttpStatus.UNAUTHORIZED).json({ message: 'Unauthorized' });
    return;
  }
  const user = await findUserById(req.user.id);
  if (!user) {
    res.status(HttpStatus.NOT_FOUND).json({ message: 'User not found' });
    return;
  }
  const notifications = await listNotificationPreferences(user.organization.toString());
  res.json({ notifications });
};
