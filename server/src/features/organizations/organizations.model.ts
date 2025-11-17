import { Schema, model, Document } from 'mongoose';

export interface OrganizationDocument extends Document {
  name: string;
  slug: string;
  owner?: Schema.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const organizationSchema = new Schema<OrganizationDocument>(
  {
    name: { type: String, required: true },
    slug: { type: String, required: true, unique: true, index: true },
    owner: { type: Schema.Types.ObjectId, ref: 'User' },
  },
  { timestamps: true },
);

export const OrganizationModel = model<OrganizationDocument>('Organization', organizationSchema);
