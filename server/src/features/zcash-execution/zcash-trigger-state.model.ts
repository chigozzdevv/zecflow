import { Document, Schema, model } from 'mongoose';

export interface ZcashTriggerStateDocument extends Document {
  trigger: Schema.Types.ObjectId;
  lastBlockHeight: number;
  processedTxIds: string[];
  createdAt: Date;
  updatedAt: Date;
}

const zcashTriggerStateSchema = new Schema<ZcashTriggerStateDocument>(
  {
    trigger: { type: Schema.Types.ObjectId, ref: 'Trigger', required: true, unique: true },
    lastBlockHeight: { type: Number, default: 0 },
    processedTxIds: { type: [String], default: [] },
  },
  { timestamps: true },
);

export const ZcashTriggerStateModel = model<ZcashTriggerStateDocument>('ZcashTriggerState', zcashTriggerStateSchema);
