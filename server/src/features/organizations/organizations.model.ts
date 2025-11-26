import { Schema, model, Document } from 'mongoose';

export const DEFAULT_FREE_CREDITS = 1000;

export interface OrganizationDocument extends Document {
  name: string;
  slug: string;
  owner?: Schema.Types.ObjectId;
  credits: number;
  totalCreditsUsed: number;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<OrganizationDocument>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
    credits: { type: Number, default: DEFAULT_FREE_CREDITS, min: 0 },
    totalCreditsUsed: { type: Number, default: 0, min: 0 },
  },
  { timestamps: true },
);

export const OrganizationModel = model<OrganizationDocument>('Organization', organizationSchema);
