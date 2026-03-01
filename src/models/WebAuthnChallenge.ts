import mongoose, { Document, Schema } from 'mongoose';

export interface IWebAuthnChallenge extends Document {
  challenge: string;
  userId?: mongoose.Types.ObjectId;
  type: 'registration' | 'authentication';
  expiresAt: Date;
  createdAt: Date;
}

const webAuthnChallengeSchema = new Schema<IWebAuthnChallenge>(
  {
    challenge: {
      type: String,
      required: true
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    },
    type: {
      type: String,
      enum: ['registration', 'authentication'],
      required: true
    },
    expiresAt: {
      type: Date,
      required: true,
      default: () => new Date(Date.now() + 2 * 60 * 1000)
    }
  },
  { timestamps: true }
);

webAuthnChallengeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

const WebAuthnChallenge = mongoose.model<IWebAuthnChallenge>(
  'WebAuthnChallenge',
  webAuthnChallengeSchema
);

export default WebAuthnChallenge;
