import mongoose, { Document, Schema } from 'mongoose';

/** Supported price-tracking sites */
export type PriceSite = 'mfc' | 'akimomo' | 'anitoys' | 'tom' | 'gkloot' | 'hpoi';

/** Stock/availability status */
export type StockStatus = 'in_stock' | 'pre_order' | 'sold_out' | 'unknown';

export const PRICE_SITES: PriceSite[] = ['mfc', 'akimomo', 'anitoys', 'tom', 'gkloot', 'hpoi'];
export const STOCK_STATUSES: StockStatus[] = ['in_stock', 'pre_order', 'sold_out', 'unknown'];

export interface IPriceRecord extends Document {
  _id: mongoose.Types.ObjectId;
  /** Reference to the figure this price is for */
  figureId: mongoose.Types.ObjectId;
  /** The site this price was scraped from */
  site: PriceSite;
  /** The specific product URL on the site */
  sourceUrl: string;
  /** Price amount in original currency */
  price: number;
  /** ISO 4217 currency code */
  currency: string;
  /** Price in USD (normalized for comparison) */
  priceUsd: number;
  /** Stock/availability status */
  stockStatus: StockStatus;
  /** Shipping cost (if available) */
  shippingCost?: number;
  /** Shipping currency */
  shippingCurrency?: string;
  /** Whether this is a resale/secondary market price */
  isResale: boolean;
  /** The scrape session that produced this record */
  scrapeSessionId?: string;
  /** Timestamp of the price observation */
  observedAt: Date;
  /** Additional metadata from the scraper */
  metadata?: Record<string, unknown>;
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

const PriceRecordSchema = new Schema<IPriceRecord>(
  {
    figureId: {
      type: Schema.Types.ObjectId,
      ref: 'Figure',
      required: true,
      index: true
    },
    site: {
      type: String,
      required: true,
      enum: PRICE_SITES,
      index: true
    },
    sourceUrl: {
      type: String,
      required: true
    },
    price: {
      type: Number,
      required: true,
      min: 0
    },
    currency: {
      type: String,
      required: true,
      maxlength: 3
    },
    priceUsd: {
      type: Number,
      required: true,
      min: 0,
      index: true
    },
    stockStatus: {
      type: String,
      enum: STOCK_STATUSES,
      default: 'unknown',
      index: true
    },
    shippingCost: {
      type: Number,
      min: 0
    },
    shippingCurrency: {
      type: String,
      maxlength: 3
    },
    isResale: {
      type: Boolean,
      default: false
    },
    scrapeSessionId: {
      type: String
    },
    observedAt: {
      type: Date,
      required: true,
      default: Date.now,
      index: true
    },
    metadata: {
      type: Schema.Types.Mixed
    }
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
PriceRecordSchema.index({ figureId: 1, site: 1, observedAt: -1 }); // Price history per figure per site
PriceRecordSchema.index({ figureId: 1, observedAt: -1 });           // Price history per figure all sites
PriceRecordSchema.index({ site: 1, observedAt: -1 });               // Latest prices per site
PriceRecordSchema.index({ stockStatus: 1, site: 1 });               // Stock availability queries

export default mongoose.model<IPriceRecord>('PriceRecord', PriceRecordSchema);
