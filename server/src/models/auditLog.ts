import mongoose, { Schema, Document } from 'mongoose';

export interface IAuditLog extends Document {
  seq: number;
  actorId: string;
  actorRole: string;
  action: string;
  entityType: string;
  entityId: string;
  before: Record<string, unknown> | null;
  after: Record<string, unknown> | null;
  ip: string;
  userAgent: string;
  prevHash: string;
  hash: string;
  createdAt: Date;
}

const auditLogSchema = new Schema<IAuditLog>(
  {
    seq: { type: Number, required: true, unique: true, index: true },
    actorId: { type: String, required: true },
    actorRole: { type: String, required: true },
    action: { type: String, required: true },
    entityType: { type: String, required: true },
    entityId: { type: String, required: true },
    before: { type: Schema.Types.Mixed, default: null },
    after: { type: Schema.Types.Mixed, default: null },
    ip: { type: String, default: '127.0.0.1' },
    userAgent: { type: String, default: 'unknown' },
    prevHash: { type: String, required: true },
    hash: { type: String, required: true },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'auditLogs',
    strict: true
  }
);

export const AuditLog = mongoose.model<IAuditLog>('AuditLog', auditLogSchema);
