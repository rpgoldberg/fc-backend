import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Entity type enum for searchable entities.
 */
export enum EntityType {
  FIGURE = 'figure',
  COMPANY = 'company',
  ARTIST = 'artist'
}

/**
 * Plain interface for SearchIndex data (without Mongoose Document methods).
 * Used for API payloads and data transfer.
 */
export interface ISearchIndexData {
  entityType: 'figure' | 'company' | 'artist';
  entityId: mongoose.Types.ObjectId;
  searchText: string;
  nameSearchable: string;
  tags?: string[];
  popularity?: number;
  mfcId?: number;
  userId?: mongoose.Types.ObjectId;
  figureName?: string;
  scale?: string;
  mfcLink?: string;
  imageUrl?: string;
  origin?: string;
  category?: string;
  companyRoles?: Array<{ companyName: string; roleName: string }>;
  artistRoles?: Array<{ artistName: string; roleName: string }>;
  releaseJans?: string[];
  releaseDates?: Date[];
}

/**
 * Full interface for SearchIndex Mongoose documents.
 * Represents a denormalized search entry optimized for MongoDB Atlas Search.
 *
 * This unified collection helps work around MongoDB Atlas's 3-index limit
 * by consolidating searchable entities (figures, companies, artists) into
 * one collection with a single search index.
 */
export interface ISearchIndex extends Document {
  _id: mongoose.Types.ObjectId;
  entityType: 'figure' | 'company' | 'artist';
  entityId: mongoose.Types.ObjectId;
  searchText: string;
  nameSearchable: string;
  tags: string[];
  popularity?: number;
  mfcId?: number;
  userId?: mongoose.Types.ObjectId;
  figureName?: string;
  scale?: string;
  mfcLink?: string;
  imageUrl?: string;
  origin?: string;
  category?: string;
  companyRoles?: Array<{ companyName: string; roleName: string }>;
  artistRoles?: Array<{ artistName: string; roleName: string }>;
  releaseJans?: string[];
  releaseDates?: Date[];
  createdAt: Date;
  updatedAt: Date;
}

const SearchIndexSchema = new Schema<ISearchIndex>(
  {
    entityType: {
      type: String,
      required: true,
      enum: ['figure', 'company', 'artist'],
      index: true
    },
    entityId: {
      type: Schema.Types.ObjectId,
      required: true,
      refPath: 'entityTypeRef'
    },
    searchText: {
      type: String,
      required: true
    },
    nameSearchable: {
      type: String,
      required: true,
      lowercase: true,
      trim: true
    },
    tags: {
      type: [String],
      default: [],
      index: true
    },
    popularity: {
      type: Number,
      index: true
    },
    mfcId: {
      type: Number,
      sparse: true,
      index: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      sparse: true,
      index: true
    },
    figureName: { type: String },
    scale: { type: String },
    mfcLink: { type: String },
    imageUrl: { type: String },
    origin: { type: String },
    category: { type: String },
    companyRoles: [{
      companyName: { type: String },
      roleName: { type: String },
      _id: false
    }],
    artistRoles: [{
      artistName: { type: String },
      roleName: { type: String },
      _id: false
    }],
    releaseJans: [{ type: String }],
    releaseDates: [{ type: Date }]
  },
  { timestamps: true }
);

// Virtual for dynamic ref path based on entityType
SearchIndexSchema.virtual('entityTypeRef').get(function() {
  switch (this.entityType) {
    case 'figure':
      return 'Figure';
    case 'company':
      return 'Company';
    case 'artist':
      return 'Artist';
    default:
      return 'Figure';
  }
});

// Compound unique index: one entry per entity
SearchIndexSchema.index({ entityType: 1, entityId: 1 }, { unique: true });

// Text index for full-text search
SearchIndexSchema.index({ searchText: 'text', nameSearchable: 'text', tags: 'text' });

// Composite index for efficient queries with popularity sorting
SearchIndexSchema.index({ entityType: 1, popularity: -1 });

// Index for tag-based filtering with popularity
SearchIndexSchema.index({ tags: 1, popularity: -1 });

// Index for user-specific entity queries
SearchIndexSchema.index({ userId: 1, entityType: 1 });

const SearchIndex: Model<ISearchIndex> = mongoose.model<ISearchIndex>('SearchIndex', SearchIndexSchema);

export default SearchIndex;
