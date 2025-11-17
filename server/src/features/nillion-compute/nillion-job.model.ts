import { Schema, model, Document } from 'mongoose';

export interface NillionJobDocument extends Document {
  runId: Schema.Types.ObjectId;
  nodeId: string;
  nadaProgram: string;
  status: 'queued' | 'encrypting' | 'submitted' | 'computing' | 'completed' | 'failed' | 'cancelled';
  inputs: Record<string, any>;
  encryptedInputs?: {
    ciphertexts: Array<Buffer>;
    clientPublicKey: Buffer;
    nonce: Buffer;
  };
  nillionComputeId?: string;
  nillionStoreId?: string;
  result?: any;
  encryptedResult?: {
    ciphertext: Buffer;
    nonce: Buffer;
  };
  error?: string;
  cost?: {
    computeUnits: number;
    storageUnits: number;
    totalCost: number;
  };
  metadata?: Record<string, any>;
  createdAt: Date;
  updatedAt: Date;
}

const nillionJobSchema = new Schema<NillionJobDocument>(
  {
    runId: { type: Schema.Types.ObjectId, ref: 'Run', required: true, index: true },
    nodeId: { type: String, required: true },
    nadaProgram: { type: String, required: true },
    status: {
      type: String,
      enum: ['queued', 'encrypting', 'submitted', 'computing', 'completed', 'failed', 'cancelled'],
      default: 'queued',
      index: true,
    },
    inputs: { type: Schema.Types.Mixed, required: true },
    encryptedInputs: {
      type: {
        ciphertexts: [Buffer],
        clientPublicKey: Buffer,
        nonce: Buffer,
      },
      default: undefined,
    },
    nillionComputeId: { type: String, index: true },
    nillionStoreId: { type: String },
    result: { type: Schema.Types.Mixed },
    encryptedResult: {
      type: {
        ciphertext: Buffer,
        nonce: Buffer,
      },
      default: undefined,
    },
    error: { type: String },
    cost: {
      type: {
        computeUnits: Number,
        storageUnits: Number,
        totalCost: Number,
      },
      default: undefined,
    },
    metadata: { type: Schema.Types.Mixed },
  },
  { timestamps: true },
);

nillionJobSchema.index({ runId: 1, nodeId: 1 });
nillionJobSchema.index({ status: 1, createdAt: -1 });

export const NillionJobModel = model<NillionJobDocument>('NillionJob', nillionJobSchema);
