import { Schema, model, Document } from 'mongoose';
import { AgentStatus } from './agents.types';

export interface AgentDocument extends Document {
  name: string;
  description?: string;
  workflow: Schema.Types.ObjectId;
  organization: Schema.Types.ObjectId;
  status: AgentStatus;
}

const agentSchema = new Schema<AgentDocument>(
  {
    name: { type: String, required: true },
    description: { type: String },
    workflow: { type: Schema.Types.ObjectId, ref: 'Workflow', required: true },
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    status: { type: String, enum: ['draft', 'active', 'archived'], default: 'draft' },
  },
  { timestamps: true },
);

export const AgentModel = model<AgentDocument>('Agent', agentSchema);
