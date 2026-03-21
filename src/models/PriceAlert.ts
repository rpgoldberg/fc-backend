import mongoose, { Document, Schema } from 'mongoose';
import { PRICE_SITES } from './PriceRecord';

/** Alert trigger types */
export type AlertType = 'price_drop' | 'price_below' | 'back_in_stock' | 'any_change';

/** Notification channels */
export type NotifyChannel = 'push' | 'email';

export const ALERT_TYPES: AlertType[] = ['price_drop', 'price_below', 'back_in_stock', 'any_change'];
export const NOTIFY_CHANNELS: NotifyChannel[] = ['push', 'email'];

export interface IPriceAlert extends Document {
  _id: mongoose.Types.ObjectId;
  /** User who created the alert */
  userId: mongoose.Types.ObjectId;
  /** Figure to track */
  figureId: mongoose.Types.ObjectId;
  /** Alert type */
  type: AlertType;
  /** Target price threshold (for price_below) */
  targetPrice?: number;
  /** Target currency */
  targetCurrency?: string;
  /** Sites to monitor (empty = all sites) */
  sites: string[];
  /** Whether the alert is active */
  active: boolean;
  /** Last time the alert was triggered */
  lastTriggeredAt?: Date;
  /** Number of times triggered */
  triggerCount: number;
  /** Notification channels */
  notifyVia: NotifyChannel[];
  /** Timestamps */
  createdAt: Date;
  updatedAt: Date;
}

const PriceAlertSchema = new Schema<IPriceAlert>(
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
    type: {
      type: String,
      required: true,
      enum: ALERT_TYPES
    },
    targetPrice: {
      type: Number,
      min: 0
    },
    targetCurrency: {
      type: String,
      maxlength: 3
    },
    sites: {
      type: [String],
      default: [],
      validate: {
        validator: function (v: string[]) {
          return v.every(s => PRICE_SITES.includes(s as any));
        },
        message: 'Invalid site value in sites array'
      }
    },
    active: {
      type: Boolean,
      default: true
    },
    lastTriggeredAt: {
      type: Date
    },
    triggerCount: {
      type: Number,
      default: 0,
      min: 0
    },
    notifyVia: {
      type: [String],
      default: ['push'],
      validate: {
        validator: function (v: string[]) {
          return v.every(c => NOTIFY_CHANNELS.includes(c as any));
        },
        message: 'Invalid notification channel'
      }
    }
  },
  { timestamps: true }
);

// Compound indexes
PriceAlertSchema.index({ userId: 1, figureId: 1 });
PriceAlertSchema.index({ userId: 1, active: 1 });
PriceAlertSchema.index({ figureId: 1, active: 1 }); // For checking alerts when price changes

export default mongoose.model<IPriceAlert>('PriceAlert', PriceAlertSchema);
