import mongoose, { Schema, Document } from 'mongoose';

export interface IUploadRow extends Document {
  uploadId: string;
  fileName: string;
  rowNumber: number;
  data: Record<string, unknown>;
  createdBy?: string;
}

const uploadRowSchema = new Schema<IUploadRow>(
  {
    uploadId: { type: String, required: true, index: true },
    fileName: { type: String, required: true },
    rowNumber: { type: Number, required: true },
    data: { type: Schema.Types.Mixed, required: true },
    createdBy: { type: String, required: false, index: true }
  },
  { timestamps: true }
);

uploadRowSchema.index({ uploadId: 1, rowNumber: 1 });

export default mongoose.model<IUploadRow>('UploadRow', uploadRowSchema);
