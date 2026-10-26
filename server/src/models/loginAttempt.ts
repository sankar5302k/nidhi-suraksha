import mongoose, { Schema, Document } from 'mongoose';

export interface ILoginAttempt extends Document {
  key: string; // emailHash + '_' + ip
  emailHash: string;
  ip: string;
  failedAttempts: number;
  lockedUntil: Date | null;
  updatedAt: Date;
}

const loginAttemptSchema = new Schema<ILoginAttempt>(
  {
    key: { type: String, required: true, unique: true, index: true },
    emailHash: { type: String, required: true, index: true },
    ip: { type: String, required: true },
    failedAttempts: { type: Number, required: true, default: 0 },
    lockedUntil: { type: Date, default: null }
  },
  {
    timestamps: true,
    collection: 'loginAttempts',
    strict: true
  }
);

export const LoginAttempt = mongoose.model<ILoginAttempt>('LoginAttempt', loginAttemptSchema);
