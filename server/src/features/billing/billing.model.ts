import { Schema, model, Document } from 'mongoose';
import { TransactionType, CreditOperation } from './billing.types';

export interface CreditTransactionDocument extends Document {
  organization: Schema.Types.ObjectId;
  type: TransactionType;
  amount: number;
  operation?: CreditOperation;
  reason?: string;
  balanceAfter: number;
}

const creditTransactionSchema = new Schema<CreditTransactionDocument>(
  {
    organization: { type: Schema.Types.ObjectId, ref: 'Organization', required: true },
    type: { type: String, enum: ['debit', 'credit'], required: true },
    amount: { type: Number, required: true },
    operation: { type: String },
    reason: { type: String },
    balanceAfter: { type: Number, required: true },
  },
  { timestamps: true },
);

creditTransactionSchema.index({ organization: 1, createdAt: -1 });

export const CreditTransactionModel = model<CreditTransactionDocument>('CreditTransaction', creditTransactionSchema);