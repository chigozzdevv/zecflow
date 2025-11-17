import { Schema, model, Document } from 'mongoose';
import { RunStatus } from './runs.types';

export interface RunDocument extends Document {
  workflow: Schema.Types.ObjectId;
  trigger?: Schema.Types.ObjectId;
  status: RunStatus;
  payload: Record<string, unknown>;
  result?: Record<string, unknown>;
}

const runSchema = new Schema<RunDocument>(
  {
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true },
    trigger: { type: Schema.Types.ObjectId, ref: 'Trigger' },
    status: { type: String, enum: ['pending', 'running', 'succeeded', 'failed'], default: 'pending' },
    payload: { type: Schema.Types.Mixed, default: {} },
    result: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

export const RunModel = model<RunDocument>('Run', runSchema);
