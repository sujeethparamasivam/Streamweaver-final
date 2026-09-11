import mongoose, { Schema, Document } from 'mongoose';

export interface IImportedRow extends Document {
  uploadId: string;
  rowNumber: number;
  data: Record<string, unknown>;
}

const importedRowSchema = new Schema<IImportedRow>(
  {
    uploadId: { type: String, required: true, index: true },
    rowNumber: { type: Number, required: true },
    data: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

importedRowSchema.index({ uploadId: 1, rowNumber: 1 });

export default mongoose.model<IImportedRow>('ImportedRow', importedRowSchema);
