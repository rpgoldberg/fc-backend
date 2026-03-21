import mongoose, { Document, Schema } from 'mongoose';
import { PRICE_SITES, STOCK_STATUSES } from './PriceRecord';

/** Price trend direction */
export type PriceTrend = 'up' | 'down' | 'stable' | 'unknown';

export const PRICE_TRENDS: PriceTrend[] = ['up', 'down', 'stable', 'unknown'];

export interface ILastKnownPrice {
  site: string;
  price: number;
  currency: string;
  priceUsd: number;
  stockStatus: string;
  observedAt: Date;
}

export interface IPriceExtremum {
  amount: number;
  currency: string;
  site: string;
  date: Date;
}

export interface IPriceWatchlist extends Document {
  _id: mongoose.Types.ObjectId;
  /** User who owns this watchlist entry */
  userId: mongoose.Types.ObjectId;
  /** Figure being tracked */
  figureId: mongoose.Types.ObjectId;
  /** Sites being tracked for this item */
  trackedSites: string[];
  /** When the user added this to their watchlist */
  addedAt: Date;
  /** Last known price per site */
  lastKnownPrices: ILastKnownPrice[];
  /** Price trend direction */
  trend: PriceTrend;
  /** Lowest price ever seen */
  lowestPrice?: IPriceExtremum;
  /** Highest price ever seen */
  highestPrice?: IPriceExtremum;
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

const LastKnownPriceSchema = new Schema<ILastKnownPrice>(
  {
    site: { type: String, required: true, enum: PRICE_SITES },
    price: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, maxlength: 3 },
    priceUsd: { type: Number, required: true, min: 0 },
    stockStatus: { type: String, enum: STOCK_STATUSES, default: 'unknown' },
    observedAt: { type: Date, required: true }
  },
  { _id: false }
);

const PriceExtremumSchema = new Schema<IPriceExtremum>(
  {
    amount: { type: Number, required: true, min: 0 },
    currency: { type: String, required: true, maxlength: 3 },
    site: { type: String, required: true },
    date: { type: Date, required: true }
  },
  { _id: false }
);

const PriceWatchlistSchema = new Schema<IPriceWatchlist>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    figureId: {
      type: Schema.Types.ObjectId,
      ref: 'Figure',
      required: true,
      index: true
    },
    trackedSites: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.every(s => PRICE_SITES.includes(s as any));
        },
        message: 'Invalid site value in trackedSites array'
      }
    },
    addedAt: {
      type: Date,
      default: Date.now,
      required: true
    },
    lastKnownPrices: {
      type: [LastKnownPriceSchema],
      default: []
    },
    trend: {
      type: String,
      enum: PRICE_TRENDS,
      default: 'unknown'
    },
    lowestPrice: {
      type: PriceExtremumSchema
    },
    highestPrice: {
      type: PriceExtremumSchema
    }
  },
  { timestamps: true }
);

// Compound indexes
PriceWatchlistSchema.index({ userId: 1, figureId: 1 }, { unique: true }); // One entry per user+figure
PriceWatchlistSchema.index({ userId: 1, addedAt: -1 }); // User's watchlist sorted by date

export default mongoose.model<IPriceWatchlist>('PriceWatchlist', PriceWatchlistSchema);
