import { Schema, model, Document } from 'mongoose';
import { WorkflowStatus, WorkflowGraph } from './workflows.types';

export interface WorkflowDocument extends Document {
  name: string;
  description?: string;
  status: WorkflowStatus;
  organization: Schema.Types.ObjectId;
  trigger?: Schema.Types.ObjectId;
  blocks: Array<Record<string, unknown>>;
  graph?: WorkflowGraph;
  version?: number;
}

const workflowSchema = new Schema<WorkflowDocument>(
  {
    name: { type: String, required: true },
    description: { type: String },
    status: { type: String, enum: ['draft', 'published', 'paused'], default: 'draft' },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    trigger: { type: Schema.Types.ObjectId, ref: 'Trigger' },
    blocks: {
      type: [
        {
          type: Schema.Types.Mixed,
        },
      ],
      default: [],
    },
    graph: {
      type: {
        nodes: [
          {
            id: String,
            blockId: String,
            type: String,
            position: { x: Number, y: Number },
            data: Schema.Types.Mixed,
            alias: String,
            connector: String,
          },
        ],
        edges: [
          {
            id: String,
            source: String,
            target: String,
            sourceHandle: String,
            targetHandle: String,
          },
        ],
        metadata: Schema.Types.Mixed,
      },
      default: undefined,
    },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export const WorkflowModel = model<WorkflowDocument>('Workflow', workflowSchema);
