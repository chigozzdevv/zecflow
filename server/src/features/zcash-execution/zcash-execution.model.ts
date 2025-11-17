import { Schema, model, Document } from 'mongoose';

export interface ZcashJobDocument extends Document {
  type: 'transaction-monitor' | 'scheduled-payment';
  config: Record<string, unknown>;
  organization: Schema.Types.ObjectId;
  createdBy: Schema.Types.ObjectId;
}

const zcashJobSchema = new Schema<ZcashJobDocument>(
  {
    type: { type: String, enum: ['transaction-monitor', 'scheduled-payment'], required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const ZcashJobModel = model<ZcashJobDocument>('ZcashJob', zcashJobSchema);
