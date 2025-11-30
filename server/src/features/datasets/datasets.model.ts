import { Schema, model, Document } from 'mongoose';

export type DatasetStatus = 'active' | 'deprecated';

export interface DatasetDocument extends Document {
  organization: Schema.Types.ObjectId;
  name: string;
  schema: any;
  nildbCollectionId?: string;
  status: DatasetStatus;
  createdAt: Date;
  updatedAt: Date;
}

const datasetSchema = new Schema<any>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true, index: true },
    name: { type: String, required: true },
    schema: { type: Schema.Types.Mixed, required: true },
    nildbCollectionId: { type: String },
    status: { type: String, enum: ['active', 'deprecated'], default: 'active' },
  },
  { timestamps: true },
);

export const DatasetModel = model<DatasetDocument>('Dataset', datasetSchema);
