import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Collection status enum for user's figure ownership state.
 */
export enum CollectionStatus {
  OWNED = 'owned',
  WISHED = 'wished',
  ORDERED = 'ordered',
  PREORDERED = 'preordered'
}

/**
 * Figure condition enum for physical state of owned figures.
 */
export enum FigureCondition {
  MINT = 'mint',
  GOOD = 'good',
  FAIR = 'fair',
  POOR = 'poor'
}

/**
 * Plain interface for UserFigure data (without Mongoose Document methods).
 * Used for API payloads and data transfer.
 */
export interface IUserFigureData {
  userId: mongoose.Types.ObjectId;
  mfcItemId: mongoose.Types.ObjectId;
  collectionStatus: 'owned' | 'wished' | 'ordered' | 'preordered';
  quantity?: number;
  purchasePrice?: number;
  purchaseCurrency?: string;
  purchaseDate?: Date;
  notes?: string;
  customTags?: string[];
  rating?: number;
  condition?: 'mint' | 'good' | 'fair' | 'poor';
}

/**
 * Full interface for UserFigure Mongoose documents.
 * Represents user-specific data about a figure in their collection.
 * References MFCItem for shared catalog data.
 */
export interface IUserFigure extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  mfcItemId: mongoose.Types.ObjectId;
  collectionStatus: 'owned' | 'wished' | 'ordered' | 'preordered';
  quantity: number;
  purchasePrice?: number;
  purchaseCurrency?: string;
  purchaseDate?: Date;
  notes?: string;
  customTags: string[];
  rating?: number;
  condition?: 'mint' | 'good' | 'fair' | 'poor';
  createdAt: Date;
  updatedAt: Date;
}

const UserFigureSchema = new Schema<IUserFigure>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    mfcItemId: {
      type: Schema.Types.ObjectId,
      ref: 'MFCItem',
      required: true,
      index: true
    },
    collectionStatus: {
      type: String,
      required: true,
      enum: ['owned', 'wished', 'ordered', 'preordered'],
      index: true
    },
    quantity: {
      type: Number,
      default: 1,
      min: [1, 'Quantity must be at least 1']
    },
    purchasePrice: {
      type: Number
    },
    purchaseCurrency: {
      type: String
    },
    purchaseDate: {
      type: Date
    },
    notes: {
      type: String
    },
    customTags: {
      type: [String],
      default: [],
      index: true
    },
    rating: {
      type: Number,
      min: [1, 'Rating must be at least 1'],
      max: [5, 'Rating must be at most 5']
    },
    condition: {
      type: String,
      enum: ['mint', 'good', 'fair', 'poor']
    }
  },
  { timestamps: true }
);

// Compound unique index: one user can only have one entry per MFCItem
UserFigureSchema.index({ userId: 1, mfcItemId: 1 }, { unique: true });

// Index for querying user's collection by status
UserFigureSchema.index({ userId: 1, collectionStatus: 1 });

// Index for sorting by rating
UserFigureSchema.index({ userId: 1, rating: -1 });

const UserFigure: Model<IUserFigure> = mongoose.model<IUserFigure>('UserFigure', UserFigureSchema);

export default UserFigure;
