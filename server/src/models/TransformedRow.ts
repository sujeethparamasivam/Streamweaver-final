import mongoose, { Schema, Document } from 'mongoose';

export interface ITransformedRow extends Document {
  uploadId: string;
  rowNumber: number;
  transformedData: Record<string, unknown>;
}

const transformedRowSchema = new Schema<ITransformedRow>(
  {
    uploadId: { type: String, required: true, index: true },
    rowNumber: { type: Number, required: true },
    transformedData: { type: Schema.Types.Mixed, required: true }
  },
  { timestamps: true }
);

transformedRowSchema.index({ uploadId: 1, rowNumber: 1 });

export default mongoose.model<ITransformedRow>('TransformedRow', transformedRowSchema);
