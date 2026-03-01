import mongoose, { Document, Schema, Model } from 'mongoose';

/**
 * Sync job phases representing the lifecycle of a bulk import.
 */
export type SyncPhase =
  | 'validating'      // Validating MFC session cookies
  | 'exporting'       // Exporting CSV from MFC
  | 'parsing'         // Parsing CSV content
  | 'fetching_activity_order' // Capturing collection activity ordering
  | 'fetching_lists'  // Fetching user lists from MFC
  | 'queueing'        // Adding items to scrape queue
  | 'enriching'       // Background enrichment in progress
  | 'completed'       // All items processed
  | 'failed'          // Job failed with error
  | 'cancelled';      // User cancelled the job

/**
 * Status of an individual item within a sync job.
 */
export type SyncItemStatus =
  | 'pending'         // Waiting in queue
  | 'processing'      // Currently being scraped
  | 'completed'       // Successfully scraped and saved
  | 'failed'          // Failed after max retries
  | 'skipped';        // Skipped (already cached or no enrichment needed)

/**
 * Individual sync item tracking subdocument.
 * Tracks each figure imported from MFC CSV.
 */
export interface ISyncItem {
  mfcId: string;
  name?: string;
  status: SyncItemStatus;
  collectionStatus: 'owned' | 'wished' | 'ordered';
  mfcActivityOrder?: number;
  isNsfw?: boolean;
  isOrphan?: boolean;
  error?: string;
  retryCount: number;
  completedAt?: Date;
}

/**
 * Statistics for a sync job.
 */
export interface ISyncStats {
  total: number;
  pending: number;
  processing: number;
  completed: number;
  failed: number;
  skipped: number;
}

/**
 * Plain interface for SyncJob data (without Mongoose Document methods).
 */
export interface ISyncJobData {
  userId: mongoose.Types.ObjectId;
  sessionId: string;
  phase: SyncPhase;
  message?: string;
  stats: ISyncStats;
  items: ISyncItem[];
  syncErrors: string[];  // Renamed to avoid conflict with Document.errors
  includeLists?: string[];
  skipCached?: boolean;
  startedAt: Date;
  completedAt?: Date;
}

/**
 * Full interface for SyncJob Mongoose documents.
 * Tracks the state of a bulk MFC sync operation.
 */
export interface ISyncJob extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  sessionId: string;
  phase: SyncPhase;
  message?: string;
  stats: ISyncStats;
  items: ISyncItem[];
  syncErrors: string[];  // Renamed to avoid conflict with Document.errors
  includeLists: string[];
  skipCached: boolean;
  startedAt: Date;
  completedAt?: Date;
  createdAt: Date;
  updatedAt: Date;

  // Virtual methods
  isActive(): boolean;
  updateItemStatus(mfcId: string, status: SyncItemStatus, error?: string): Promise<void>;
  recalculateStats(): void;
}

// Subdocument schemas
const SyncItemSchema = new Schema<ISyncItem>(
  {
    mfcId: { type: String, required: true },
    name: { type: String },
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'skipped'],
      default: 'pending'
    },
    collectionStatus: {
      type: String,
      enum: ['owned', 'wished', 'ordered'],
      required: true
    },
    mfcActivityOrder: { type: Number },
    isNsfw: { type: Boolean, default: false },
    isOrphan: { type: Boolean, default: false },
    error: { type: String },
    retryCount: { type: Number, default: 0 },
    completedAt: { type: Date }
  },
  { _id: false }
);

const SyncStatsSchema = new Schema<ISyncStats>(
  {
    total: { type: Number, default: 0 },
    pending: { type: Number, default: 0 },
    processing: { type: Number, default: 0 },
    completed: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    skipped: { type: Number, default: 0 }
  },
  { _id: false }
);

const SyncJobSchema = new Schema<ISyncJob>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
      index: true
    },
    sessionId: {
      type: String,
      required: true
      // Note: unique index defined separately below with schema.index()
    },
    phase: {
      type: String,
      enum: ['validating', 'exporting', 'parsing', 'fetching_activity_order', 'fetching_lists', 'queueing', 'enriching', 'completed', 'failed', 'cancelled'],
      default: 'validating',
      index: true
    },
    message: {
      type: String
    },
    stats: {
      type: SyncStatsSchema,
      default: () => ({
        total: 0,
        pending: 0,
        processing: 0,
        completed: 0,
        failed: 0,
        skipped: 0
      })
    },
    items: {
      type: [SyncItemSchema],
      default: []
    },
    syncErrors: {
      type: [String],
      default: []
    },
    includeLists: {
      type: [String],
      default: ['owned', 'ordered', 'wished']
    },
    skipCached: {
      type: Boolean,
      default: false
    },
    startedAt: {
      type: Date,
      default: Date.now
    },
    completedAt: {
      type: Date
    }
  },
  { timestamps: true }
);

// Indexes for efficient queries
SyncJobSchema.index({ userId: 1, createdAt: -1 });
SyncJobSchema.index({ sessionId: 1 }, { unique: true });
SyncJobSchema.index({ phase: 1, userId: 1 });

// TTL index to auto-delete completed jobs after 7 days
SyncJobSchema.index(
  { completedAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60, partialFilterExpression: { completedAt: { $exists: true } } }
);

/**
 * Check if the job is still active (not completed, failed, or cancelled).
 */
SyncJobSchema.methods.isActive = function(): boolean {
  return !['completed', 'failed', 'cancelled'].includes(this.phase);
};

/**
 * Update the status of a specific item and recalculate stats.
 */
SyncJobSchema.methods.updateItemStatus = async function(
  mfcId: string,
  status: SyncItemStatus,
  error?: string
): Promise<void> {
  const item = this.items.find((i: ISyncItem) => i.mfcId === mfcId);
  if (item) {
    item.status = status;
    if (error) {
      item.error = error;
      item.retryCount += 1;
    }
    if (status === 'completed' || status === 'failed' || status === 'skipped') {
      item.completedAt = new Date();
    }
  }
  this.recalculateStats();
  await this.save();
};

/**
 * Recalculate job statistics based on current item statuses.
 */
SyncJobSchema.methods.recalculateStats = function(): void {
  const stats: ISyncStats = {
    total: this.items.length,
    pending: 0,
    processing: 0,
    completed: 0,
    failed: 0,
    skipped: 0
  };

  for (const item of this.items) {
    switch (item.status) {
      case 'pending':
        stats.pending++;
        break;
      case 'processing':
        stats.processing++;
        break;
      case 'completed':
        stats.completed++;
        break;
      case 'failed':
        stats.failed++;
        break;
      case 'skipped':
        stats.skipped++;
        break;
    }
  }

  this.stats = stats;

  // Check if job is complete
  if (stats.pending === 0 && stats.processing === 0) {
    this.phase = 'completed';
    this.completedAt = new Date();
    this.message = `Sync complete: ${stats.completed} enriched, ${stats.skipped} skipped, ${stats.failed} failed`;
  }
};

const SyncJob: Model<ISyncJob> = mongoose.model<ISyncJob>('SyncJob', SyncJobSchema);

export default SyncJob;
