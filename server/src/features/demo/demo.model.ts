import { Schema, model, Document } from 'mongoose';

export interface DemoSubmissionDocument extends Document {
  stateKey: string;
  processed: boolean;
}

const demoSubmissionSchema = new Schema<DemoSubmissionDocument>(
  {
    stateKey: { type: String, required: true },
    processed: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export const DemoSubmissionModel = model<DemoSubmissionDocument>('DemoSubmission', demoSubmissionSchema);
