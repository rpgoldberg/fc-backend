import mongoose, { Document, Schema } from 'mongoose';

export interface ITwoFactorSession extends Document {
  userId: mongoose.Types.ObjectId;
  methods: string[];
  expiresAt: Date;
  isUsed: boolean;
  createdAt: Date;
}

const twoFactorSessionSchema = new Schema<ITwoFactorSession>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    methods: {
      type: [String],
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 5 * 60 * 1000)
    },
    isUsed: {
      type: Boolean,
      default: false
    }
  },
  { timestamps: true }
);

twoFactorSessionSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const TwoFactorSession = mongoose.model<ITwoFactorSession>(
  'TwoFactorSession',
  twoFactorSessionSchema
);

export default TwoFactorSession;
