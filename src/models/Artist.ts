import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Plain interface for Artist data (without Mongoose Document methods).
 * Used for API payloads and data transfer.
 */
export interface IArtistData {
  name: string;
  mfcId?: number;
}

/**
 * Full interface for Artist Mongoose documents.
 * Extends Document and includes MongoDB-specific fields.
 *
 * Note: Artists are associated with roles (Illustrator, Sculptor, etc.)
 * through the MFCItem model's artists array, not stored here.
 */
export interface IArtist extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  mfcId?: number;
  createdAt: Date;
  updatedAt: Date;
}

const ArtistSchema = new Schema<IArtist>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
      unique: true,
      index: true
    },
    mfcId: {
      type: Number,
      sparse: true,
      unique: true,
      index: true
    }
  },
  { timestamps: true }
);

// Text index for full-text search
ArtistSchema.index({ name: 'text' });

const Artist: Model<IArtist> = mongoose.model<IArtist>('Artist', ArtistSchema);

export default Artist;
