import mongoose, { Schema, Document } from 'mongoose';

export interface IAiUsage extends Document {
  userId: string;
  feature: 'document_extraction' | 'copilot_query' | 'notice_draft';
  tokensIn: number;
  tokensOut: number;
  latencyMs: number;
  status: 'SUCCESS' | 'ERROR' | 'RATE_LIMITED';
  createdAt: Date;
}

const aiUsageSchema = new Schema<IAiUsage>(
  {
    userId: { type: String, required: true, index: true },
    feature: {
      type: String,
      required: true,
      enum: ['document_extraction', 'copilot_query', 'notice_draft']
    },
    tokensIn: { type: Number, required: true, default: 0 },
    tokensOut: { type: Number, required: true, default: 0 },
    latencyMs: { type: Number, required: true, default: 0 },
    status: {
      type: String,
      required: true,
      enum: ['SUCCESS', 'ERROR', 'RATE_LIMITED'],
      default: 'SUCCESS'
    },
    createdAt: {
      type: Date,
      default: Date.now,
      index: true
    }
  },
  {
    timestamps: false,
    collection: 'aiUsage',
    strict: true
  }
);

// Index for daily budget aggregations
aiUsageSchema.index({ userId: 1, createdAt: -1 });

export const AiUsage = mongoose.model<IAiUsage>('AiUsage', aiUsageSchema);
