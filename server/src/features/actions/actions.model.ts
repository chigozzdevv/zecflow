import { Schema, model, Document } from 'mongoose';

export interface ActionDocument extends Document {
  workflow: Schema.Types.ObjectId;
  type: string;
  config: Record<string, unknown>;
  organization: Schema.Types.ObjectId;
  createdBy: Schema.Types.ObjectId;
}

const actionSchema = new Schema<ActionDocument>(
  {
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true },
    type: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  },
  { timestamps: true },
);

export const ActionModel = model<ActionDocument>('Action', actionSchema);
