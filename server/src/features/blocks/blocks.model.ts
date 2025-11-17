import { Schema, model, Document } from 'mongoose';

export interface BlockDocument extends Document {
  workflow: Schema.Types.ObjectId;
  type: string;
  config: Record<string, unknown>;
  position: { x: number; y: number };
  organization: Schema.Types.ObjectId;
  order: number;
  alias?: string;
  dependencies: Schema.Types.ObjectId[];
  connector?: Schema.Types.ObjectId;
}

const blockSchema = new Schema<BlockDocument>(
  {
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true },
    type: { type: String, required: true },
    config: { type: Schema.Types.Mixed, default: {} },
    position: {
      x: { type: Number, default: 0 },
      y: { type: Number, default: 0 },
    },
    order: { type: Number, default: 0 },
    alias: { type: String },
    dependencies: [{ type: Schema.Types.ObjectId, ref: 'Block' }],
    connector: { type: Schema.Types.ObjectId, ref: 'Connector' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
  },
  { timestamps: true },
);

export const BlockModel = model<BlockDocument>('Block', blockSchema);
