import { Schema, model, Document } from 'mongoose';
import { WorkflowStatus, WorkflowGraph } from './workflows.types';

export interface WorkflowDocument extends Document {
  name: string;
  description?: string;
  status: WorkflowStatus;
  organization: Schema.Types.ObjectId;
  trigger?: Schema.Types.ObjectId;
   dataset?: Schema.Types.ObjectId;
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
    dataset: { type: Schema.Types.ObjectId, ref: 'Dataset' },
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
            id: { type: String },
            blockId: { type: String },
            type: { type: String },
            position: { x: { type: Number }, y: { type: Number } },
            data: { type: Schema.Types.Mixed },
            alias: { type: String },
            connector: { type: String },
          },
        ],
        edges: [
          {
            id: { type: String },
            source: { type: String },
            target: { type: String },
            sourceHandle: { type: String },
            targetHandle: { type: String },
          },
        ],
        metadata: { type: Schema.Types.Mixed },
      },
      default: undefined,
    },
    version: { type: Number, default: 1 },
  },
  { timestamps: true },
);

export const WorkflowModel = model<WorkflowDocument>('Workflow', workflowSchema);
