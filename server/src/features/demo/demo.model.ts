import { Schema, model, Document } from 'mongoose';

export interface DemoSubmissionDocument extends Document {
  stateKey: string;
  fullName: string;
  income: number;
  existingDebt: number;
  age: number;
  country?: string;
  requestedAmount: number;
  processed: boolean;
}

const demoSubmissionSchema = new Schema<DemoSubmissionDocument>(
  {
    stateKey: { type: String, required: true },
    fullName: { type: String, required: true },
    income: { type: Number, required: true },
    existingDebt: { type: Number, required: true },
    age: { type: Number, required: true },
    country: { type: String, required: false },
    requestedAmount: { type: Number, required: true },
    processed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const DemoSubmissionModel = model<DemoSubmissionDocument>('DemoSubmission', demoSubmissionSchema);
