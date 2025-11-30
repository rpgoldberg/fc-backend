import mongoose, { Document, Schema } from 'mongoose';

export interface ISystemConfig extends Document {
  _id: mongoose.Types.ObjectId;
  key: string;
  value: string;
  type: 'script' | 'markdown' | 'json' | 'text';
  description?: string;
  isPublic: boolean;
  updatedBy?: mongoose.Types.ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

const SystemConfigSchema = new Schema<ISystemConfig>(
  {
    key: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      match: /^[a-z][a-z0-9_]*$/  // lowercase, starts with letter, alphanumeric + underscore
    },
    value: {
      type: String,
      required: true
    },
    type: {
      type: String,
      enum: ['script', 'markdown', 'json', 'text'],
      default: 'text'
    },
    description: {
      type: String,
      trim: true
    },
    isPublic: {
      type: Boolean,
      default: false
    },
    updatedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User'
    }
  },
  { timestamps: true }
);

// Index for public configs (for the public API)
// Note: key index is created by unique: true
SystemConfigSchema.index({ isPublic: 1 });

export default mongoose.model<ISystemConfig>('SystemConfig', SystemConfigSchema);
