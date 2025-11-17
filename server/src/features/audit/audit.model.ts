import { Schema, model, Document } from 'mongoose';

export interface AuditDocument extends Document {
  actor: Schema.Types.ObjectId;
  organization: Schema.Types.ObjectId;
  action: string;
  resource: string;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

const auditSchema = new Schema<AuditDocument>(
  {
    actor: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    action: { type: String, required: true },
    resource: { type: String, required: true },
    metadata: { type: Schema.Types.Mixed, default: {} },
  },
  { timestamps: true },
);

export const AuditModel = model<AuditDocument>('AuditLog', auditSchema);
