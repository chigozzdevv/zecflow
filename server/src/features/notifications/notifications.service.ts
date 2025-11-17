import { notificationService } from '@/shared/services/notification.service';
import { NotificationModel } from './notifications.model';

interface CreateNotificationInput {
  channel: 'email' | 'webhook';
  target: string;
  template: string;
  organizationId: string;
  userId: string;
}

export const createNotificationPreference = async (input: CreateNotificationInput) => {
  const notification = await NotificationModel.create({
    channel: input.channel,
    target: input.target,
    template: input.template,
    organization: input.organizationId,
    createdBy: input.userId,
  });

  await notificationService.send(input.channel, { target: input.target, template: input.template });

  return notification;
};

export const listNotificationPreferences = (organizationId: string) => {
  return NotificationModel.find({ organization: organizationId }).lean();
};
