import { Schema, model, Document } from 'mongoose';

export interface TriggerDocument extends Document {
  name: string;
  type: string;
  config: Record<string, unknown>;
  organization: Schema.Types.ObjectId;
  connector?: Schema.Types.ObjectId;
  status: 'active' | 'inactive';
  createdBy: Schema.Types.ObjectId;
}

const triggerSchema = new Schema<TriggerDocument>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    connector: { type: Schema.Types.ObjectId, ref: 'Connector' },
    status: { type: String, enum: ['active', 'inactive'], default: 'inactive' },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const TriggerModel = model<TriggerDocument>('Trigger', triggerSchema);
