import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Notification types representing the different events that can trigger notifications.
 */
export type NotificationType =
  | 'price_alert'
  | 'sync_complete'
  | 'sync_error'
  | 'collection_update'
  | 'system';

/**
 * Plain interface for Notification data (without Mongoose Document methods).
 */
export interface INotificationData {
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

/**
 * Full interface for Notification Mongoose documents.
 * Stores notifications for the in-app notification center.
 */
export interface INotification extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  type: NotificationType;
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
  read: boolean;
  createdAt: Date;
  updatedAt: Date;
}

const NotificationSchema = new Schema<INotification>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true,
    },
    type: {
      type: String,
      enum: ['price_alert', 'sync_complete', 'sync_error', 'collection_update', 'system'],
      required: true,
    },
    title: {
      type: String,
      required: true,
      maxlength: 200,
    },
    body: {
      type: String,
      required: true,
      maxlength: 1000,
    },
    url: {
      type: String,
      maxlength: 500,
    },
    data: {
      type: Schema.Types.Mixed,
    },
    read: {
      type: Boolean,
      default: false,
      index: true,
    },
  },
  { timestamps: true }
);

// Compound indexes for efficient queries
NotificationSchema.index({ userId: 1, createdAt: -1 });
NotificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

// TTL index to auto-delete old notifications after 30 days
NotificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 30 * 24 * 60 * 60 }
);

const Notification: Model<INotification> = mongoose.model<INotification>(
  'Notification',
  NotificationSchema
);

export default Notification;
