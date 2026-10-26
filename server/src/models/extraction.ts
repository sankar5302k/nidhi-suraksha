import mongoose, { Schema, Document } from 'mongoose';

export interface IExtractionField {
  name: string;
  value: string | number | boolean | null;
  confidence: number;
  confirmedBy?: string | null;
}

export interface IExtraction {
  _id?: mongoose.Types.ObjectId;
  documentId: mongoose.Types.ObjectId;
  fdrId: mongoose.Types.ObjectId;
  fields: IExtractionField[];
  model: string;
  promptVersion: string;
  inputHash: string; // Hash of redacted OCR text
  validatedJson: Record<string, unknown>;
  status: 'UNCONFIRMED' | 'CONFIRMED' | 'REJECTED';
  createdAt?: Date;
  updatedAt?: Date;
}

const extractionSchema = new Schema<IExtraction>(
  {
    documentId: { type: Schema.Types.ObjectId, ref: 'Document', required: true, index: true },
    fdrId: { type: Schema.Types.ObjectId, ref: 'Fdr', required: true, index: true },
    fields: [
      {
        name: { type: String, required: true },
        value: { type: Schema.Types.Mixed, default: null },
        confidence: { type: Number, required: true, min: 0, max: 1 },
        confirmedBy: { type: String, default: null }
      }
    ],
    model: { type: String, required: true },
    promptVersion: { type: String, required: true },
    inputHash: { type: String, required: true },
    validatedJson: { type: Schema.Types.Mixed, required: true },
    status: {
      type: String,
      enum: ['UNCONFIRMED', 'CONFIRMED', 'REJECTED'],
      default: 'UNCONFIRMED',
      index: true
    }
  },
  {
    timestamps: true,
    collection: 'extractions',
    strict: true
  }
);

export const Extraction = mongoose.model<IExtraction>('Extraction', extractionSchema);
