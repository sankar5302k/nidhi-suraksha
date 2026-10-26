import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditCounter {
  _id: string;
  seq: number;
}

const auditCounterSchema = new Schema<IAuditCounter>(
  {
    _id: { type: String, required: true },
    seq: { type: Number, required: true, default: 0 }
  },
  { collection: 'auditCounters', strict: true }
);

export const AuditCounter = mongoose.model<IAuditCounter>('AuditCounter', auditCounterSchema);
