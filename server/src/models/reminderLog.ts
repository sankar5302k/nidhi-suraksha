import mongoose, { Schema, Document } from 'mongoose';

export interface IReminderLog extends Document {
  fdrId: mongoose.Types.ObjectId;
  institutionId: string;
  triggerDays: number; // e.g. 90, 60, 30, 7, 0
  recipientEmail: string;
  subject: string;
  channel: 'EMAIL' | 'PORTAL_NOTICE';
  status: 'SENT' | 'FAILED';
  simulated: boolean;
  createdAt: Date;
}

const reminderLogSchema = new Schema<IReminderLog>(
  {
    fdrId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, index: true },
    institutionId: { type: String, required: true, index: true },
    triggerDays: { type: Number, required: true },
    recipientEmail: { type: String, required: true },
    subject: { type: String, required: true },
    channel: { type: String, enum: ['EMAIL', 'PORTAL_NOTICE'], default: 'EMAIL' },
    status: { type: String, enum: ['SENT', 'FAILED'], default: 'SENT' },
    simulated: { type: Boolean, default: false }
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    collection: 'reminderLogs',
    strict: true
  }
);

reminderLogSchema.index({ fdrId: 1, triggerDays: 1 });

export const ReminderLog = mongoose.model<IReminderLog>('ReminderLog', reminderLogSchema);
