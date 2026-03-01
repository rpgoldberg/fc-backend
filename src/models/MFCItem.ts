import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Interface for release information (subdocument).
 * Tracks original release and rereleases with pricing.
 */
export interface IRelease {
  date?: Date;
  price?: number;
  currency?: string;
  isRerelease: boolean;
  jan?: string;  // JAN/EAN/UPC barcode (10-13 digits)
}

/**
 * Interface for physical dimensions (subdocument).
 */
export interface IDimensions {
  heightMm?: number;
  widthMm?: number;
  depthMm?: number;
  scaledHeight?: string;
}

/**
 * Interface for MFC community statistics (subdocument).
 */
export interface ICommunityStats {
  ownedCount?: number;
  wishedCount?: number;
  orderedCount?: number;
  listedInCount?: number;
  averageScore?: number;
}

/**
 * Interface for related item reference (subdocument).
 */
export interface IRelatedItem {
  mfcId: number;
  relationType?: string;
  name?: string;
  imageUrl?: string;
}

/**
 * Interface for company-role association (subdocument).
 */
export interface ICompanyRole {
  companyId: mongoose.Types.ObjectId;
  roleId: mongoose.Types.ObjectId;
}

/**
 * Interface for artist-role association (subdocument).
 */
export interface IArtistRole {
  artistId: mongoose.Types.ObjectId;
  roleId: mongoose.Types.ObjectId;
}

/**
 * Plain interface for MFCItem data (without Mongoose Document methods).
 * Used for API payloads and data transfer.
 */
export interface IMFCItemData {
  mfcId: number;
  mfcUrl: string;
  name: string;
  scale?: string;
  companies?: ICompanyRole[];
  artists?: IArtistRole[];
  tags?: string[];
  imageUrls?: string[];
  releases?: IRelease[];
  dimensions?: IDimensions;
  communityStats?: ICommunityStats;
  relatedItems?: IRelatedItem[];
  lastScrapedAt?: Date;
}

/**
 * Full interface for MFCItem Mongoose documents.
 * Represents shared catalog data from MyFigureCollection.
 * This is the common data that all users see - pricing, dimensions, images, etc.
 */
export interface IMFCItem extends Document {
  _id: mongoose.Types.ObjectId;
  mfcId: number;
  mfcUrl: string;
  name: string;
  scale?: string;
  companies: ICompanyRole[];
  artists: IArtistRole[];
  tags: string[];
  imageUrls: string[];
  releases: IRelease[];
  dimensions?: IDimensions;
  communityStats?: ICommunityStats;
  relatedItems: IRelatedItem[];
  lastScrapedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Subdocument schemas
const ReleaseSchema = new Schema<IRelease>(
  {
    date: { type: Date },
    price: { type: Number },
    currency: { type: String },
    isRerelease: { type: Boolean, default: false },
    jan: { type: String }  // JAN/EAN/UPC barcode
  },
  { _id: false }
);

const DimensionsSchema = new Schema<IDimensions>(
  {
    heightMm: { type: Number },
    widthMm: { type: Number },
    depthMm: { type: Number },
    scaledHeight: { type: String }
  },
  { _id: false }
);

const CommunityStatsSchema = new Schema<ICommunityStats>(
  {
    ownedCount: { type: Number },
    wishedCount: { type: Number },
    orderedCount: { type: Number },
    listedInCount: { type: Number },
    averageScore: { type: Number },
  },
  { _id: false }
);

const RelatedItemSchema = new Schema<IRelatedItem>(
  {
    mfcId: { type: Number, required: true },
    relationType: { type: String },
    name: { type: String },
    imageUrl: { type: String },
  },
  { _id: false }
);

const CompanyRoleSchema = new Schema<ICompanyRole>(
  {
    companyId: { type: Schema.Types.ObjectId, ref: 'Company', required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'RoleType', required: true }
  },
  { _id: false }
);

const ArtistRoleSchema = new Schema<IArtistRole>(
  {
    artistId: { type: Schema.Types.ObjectId, ref: 'Artist', required: true },
    roleId: { type: Schema.Types.ObjectId, ref: 'RoleType', required: true }
  },
  { _id: false }
);

const MFCItemSchema = new Schema<IMFCItem>(
  {
    mfcId: {
      type: Number,
      required: true,
      unique: true,
      index: true
    },
    mfcUrl: {
      type: String,
      required: true
    },
    name: {
      type: String,
      required: true,
      trim: true,
      index: true
    },
    scale: {
      type: String,
      index: true
    },
    companies: {
      type: [CompanyRoleSchema],
      default: []
    },
    artists: {
      type: [ArtistRoleSchema],
      default: []
    },
    tags: {
      type: [String],
      default: [],
      index: true
    },
    imageUrls: {
      type: [String],
      default: []
    },
    releases: {
      type: [ReleaseSchema],
      default: []
    },
    dimensions: {
      type: DimensionsSchema
    },
    communityStats: {
      type: CommunityStatsSchema
    },
    relatedItems: {
      type: [RelatedItemSchema],
      default: []
    },
    lastScrapedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Text index for full-text search
MFCItemSchema.index({ name: 'text', tags: 'text' });

const MFCItem: Model<IMFCItem> = mongoose.model<IMFCItem>('MFCItem', MFCItemSchema);

export default MFCItem;
