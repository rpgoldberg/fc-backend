import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Stores dismissed duplicate pairs so they are not surfaced again.
 * When a user reviews a detected duplicate pair and decides they are
 * intentional (e.g., two versions of the same figure), the pair is recorded
 * here to suppress future detection results.
 */
export interface IDuplicateDismissal extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  figureAId: mongoose.Types.ObjectId;
  figureBId: mongoose.Types.ObjectId;
  dismissedAt: Date;
}

export interface IDuplicateDismissalData {
  userId: mongoose.Types.ObjectId;
  figureAId: mongoose.Types.ObjectId;
  figureBId: mongoose.Types.ObjectId;
  dismissedAt?: Date;
}

const DuplicateDismissalSchema = new Schema<IDuplicateDismissal>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    figureAId: {
      type: Schema.Types.ObjectId,
      ref: 'Figure',
      required: true
    },
    figureBId: {
      type: Schema.Types.ObjectId,
      ref: 'Figure',
      required: true
    },
    dismissedAt: {
      type: Date,
      default: Date.now
    }
  },
  { timestamps: false }
);

// Compound index: efficiently query all dismissals for a user
DuplicateDismissalSchema.index({ userId: 1, figureAId: 1, figureBId: 1 }, { unique: true });

const DuplicateDismissal: Model<IDuplicateDismissal> = mongoose.model<IDuplicateDismissal>(
  'DuplicateDismissal',
  DuplicateDismissalSchema
);

export default DuplicateDismissal;
