import { Schema, model, Document } from 'mongoose';

export interface NillionWorkloadDocument extends Document {
  name: string;
  workloadId: string;
  description?: string;
  organization: Schema.Types.ObjectId;
  config: Record<string, unknown>;
  publicUrl?: string;
  attestation?: Record<string, unknown>;
}

const workloadSchema = new Schema<NillionWorkloadDocument>(
  {
    name: { type: String, required: true },
    workloadId: { type: String, required: true },
    description: { type: String },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    publicUrl: { type: String },
    attestation: { type: Schema.Types.Mixed, default: null },
  },
  { timestamps: true },
);

export const NillionWorkloadModel = model<NillionWorkloadDocument>('NillionWorkload', workloadSchema);
