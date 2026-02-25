import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Valid privacy levels for an MFC list.
 * Maps to MFC edit form radio values: 0=Everyone, 1=Friends only, 2=Nobody.
 */
export type ListPrivacy = 'public' | 'friends' | 'private';

/** MFC edit form field limits — match source to prevent round-trip data loss. */
export const MFC_LIST_LIMITS = {
  NAME_MAX: 32,
  TEASER_MAX: 64,
  DESCRIPTION_MAX_BBCODE: 7200,
} as const;

/**
 * Plain interface for MfcList data (without Mongoose Document methods).
 * Used for API payloads and data transfer.
 */
export interface IMfcListData {
  mfcId: number;
  userId: mongoose.Types.ObjectId;
  name: string;
  teaser?: string;
  description?: string;
  privacy?: ListPrivacy;
  iconUrl?: string;
  allowComments?: boolean;
  mailOnSales?: boolean;
  mailOnHunts?: boolean;
  itemCount?: number;
  itemMfcIds?: number[];
  mfcCreatedAt?: Date;
  mfcLastEditedAt?: Date;
  lastSyncedAt?: Date;
}

/**
 * Full interface for MfcList Mongoose documents.
 * Represents a user's custom list imported from MyFigureCollection.
 * Each list belongs to one user and contains references to MFC items by ID.
 */
export interface IMfcList extends Document {
  _id: mongoose.Types.ObjectId;
  mfcId: number;
  userId: mongoose.Types.ObjectId;
  name: string;
  teaser?: string;
  description?: string;
  privacy: ListPrivacy;
  iconUrl?: string;
  allowComments: boolean;
  mailOnSales: boolean;
  mailOnHunts: boolean;
  itemCount: number;
  itemMfcIds: number[];
  mfcCreatedAt?: Date;
  mfcLastEditedAt?: Date;
  lastSyncedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const MfcListSchema = new Schema<IMfcList>(
  {
    mfcId: {
      type: Number,
      required: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    name: {
      type: String,
      required: true,
      trim: true,
      maxlength: MFC_LIST_LIMITS.NAME_MAX,
    },
    teaser: {
      type: String,
      trim: true,
      maxlength: MFC_LIST_LIMITS.TEASER_MAX,
    },
    description: {
      type: String,
    },
    privacy: {
      type: String,
      enum: ['public', 'friends', 'private'],
      default: 'public',
    },
    iconUrl: {
      type: String,
    },
    allowComments: {
      type: Boolean,
      default: false,
    },
    mailOnSales: {
      type: Boolean,
      default: false,
    },
    mailOnHunts: {
      type: Boolean,
      default: false,
    },
    itemCount: {
      type: Number,
      default: 0,
      min: 0,
    },
    itemMfcIds: {
      type: [Number],
      default: [],
      index: true,
    },
    mfcCreatedAt: {
      type: Date,
    },
    mfcLastEditedAt: {
      type: Date,
    },
    lastSyncedAt: {
      type: Date,
    },
  },
  { timestamps: true }
);

// Compound unique index: one list per user per MFC list ID
MfcListSchema.index({ userId: 1, mfcId: 1 }, { unique: true });

const MfcList: Model<IMfcList> = mongoose.model<IMfcList>('MfcList', MfcListSchema);

export default MfcList;
