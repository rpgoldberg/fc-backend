import mongoose, { Document, Schema } from 'mongoose';

export interface IPushSubscription extends Document {
  userId: mongoose.Types.ObjectId;
  endpoint: string;
  keys: {
    p256dh: string;
    auth: string;
  };
  userAgent?: string;
  createdAt: Date;
  updatedAt: Date;
  lastUsedAt?: Date;
  failCount: number;
}

const PushSubscriptionSchema = new Schema<IPushSubscription>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    endpoint: { type: String, required: true, unique: true },
    keys: {
      p256dh: { type: String, required: true },
      auth: { type: String, required: true },
    },
    userAgent: { type: String },
    lastUsedAt: { type: Date },
    failCount: { type: Number, default: 0 },
  },
  { timestamps: true }
);

// Efficient lookup by user
PushSubscriptionSchema.index({ userId: 1 });
// Remove subscriptions that have failed too many times
PushSubscriptionSchema.index({ failCount: 1 });

export default mongoose.model<IPushSubscription>('PushSubscription', PushSubscriptionSchema);
