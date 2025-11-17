import { Schema, model, Document } from 'mongoose';

export interface NotificationDocument extends Document {
  channel: 'email' | 'webhook';
  target: string;
  template: string;
  organization: Schema.Types.ObjectId;
  createdBy: Schema.Types.ObjectId;
}

const notificationSchema = new Schema<NotificationDocument>(
  {
    channel: { type: String, enum: ['email', 'webhook'], required: true },
    target: { type: String, required: true },
    template: { type: String, required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const NotificationModel = model<NotificationDocument>('Notification', notificationSchema);
