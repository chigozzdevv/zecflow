import { EventEmitter } from 'events';

class NotificationService extends EventEmitter {
  async send(channel: 'email' | 'webhook', payload: Record<string, unknown>): Promise<void> {
    this.emit('notification', { channel, payload });
  }
}

export const notificationService = new NotificationService();
