import { Schema, model, Document } from 'mongoose';

export interface ConnectorDocument extends Document {
  name: string;
  type: string;
  config: Record<string, unknown>;
  organization: Schema.Types.ObjectId;
  createdBy: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const connectorSchema = new Schema<ConnectorDocument>(
  {
    name: { type: String, required: true },
    type: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const ConnectorModel = model<ConnectorDocument>('Connector', connectorSchema);
