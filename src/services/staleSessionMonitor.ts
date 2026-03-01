/**
 * Stale Session Monitor
 *
 * Periodically checks for active SyncJobs that haven't received webhook
 * updates within a configurable timeout. When detected, marks them as
 * failed so users aren't stuck with phantom "in progress" sync jobs.
 *
 * This handles the case where the scraper finishes or crashes but
 * webhooks never arrive at the backend.
 */

import SyncJob from '../models/SyncJob';
import { createLogger } from '../utils/logger';

const logger = createLogger('STALE_MONITOR');

// Default: check every 5 minutes
const DEFAULT_CHECK_INTERVAL_MS = 5 * 60 * 1000;

// Default: jobs are stale after 30 minutes without updates
const DEFAULT_STALE_THRESHOLD_MS = 30 * 60 * 1000;

export interface StaleSessionMonitorOptions {
  checkIntervalMs?: number;
  staleThresholdMs?: number;
  onSessionMarkedStale?: (sessionId: string) => void;
}

export class StaleSessionMonitor {
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly checkIntervalMs: number;
  private readonly staleThresholdMs: number;
  private readonly onSessionMarkedStale?: (sessionId: string) => void;

  constructor(options: StaleSessionMonitorOptions = {}) {
    this.checkIntervalMs = options.checkIntervalMs ?? DEFAULT_CHECK_INTERVAL_MS;
    this.staleThresholdMs = options.staleThresholdMs ?? DEFAULT_STALE_THRESHOLD_MS;
    this.onSessionMarkedStale = options.onSessionMarkedStale;
  }

  /**
   * Start the periodic stale session check.
   */
  start(): void {
    if (this.intervalId) {
      logger.warn('Monitor already running');
      return;
    }

    logger.info(
      `Starting stale session monitor (interval: ${this.checkIntervalMs}ms, threshold: ${this.staleThresholdMs}ms)`
    );

    this.intervalId = setInterval(() => {
      this.checkForStaleSessions().catch((err) => {
        logger.error('Error during stale session check:', err);
      });
    }, this.checkIntervalMs);
  }

  /**
   * Stop the periodic check and clean up.
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
      logger.info('Stale session monitor stopped');
    }
  }

  /**
   * Check for and handle stale sessions.
   * Public so it can be called directly in tests.
   */
  async checkForStaleSessions(): Promise<number> {
    const cutoff = new Date(Date.now() - this.staleThresholdMs);

    // Find active jobs that haven't been updated since the cutoff
    const staleJobs = await SyncJob.find({
      phase: { $nin: ['completed', 'failed', 'cancelled'] },
      updatedAt: { $lt: cutoff }
    });

    if (staleJobs.length === 0) {
      return 0;
    }

    logger.info(`Found ${staleJobs.length} stale session(s)`);

    for (const job of staleJobs) {
      const staleDurationMs = Date.now() - (job.updatedAt?.getTime() ?? 0);
      const staleDurationMin = Math.round(staleDurationMs / 60000);

      logger.info(
        `Marking session ${job.sessionId} as failed (stale for ${staleDurationMin} min, was in phase: ${job.phase})`
      );

      // Mark any pending/processing items as failed
      let itemsTimedOut = 0;
      for (const item of job.items) {
        if (item.status === 'pending' || item.status === 'processing') {
          item.status = 'failed';
          item.error = 'Timed out waiting for scraper response';
          item.completedAt = new Date();
          itemsTimedOut++;
        }
      }

      // Recalculate stats based on updated items
      job.recalculateStats();

      // Override the phase to failed (recalculateStats may set 'completed' if all items resolved)
      job.phase = 'failed';
      job.message = `Sync timed out after ${staleDurationMin} minutes without updates (${itemsTimedOut} items timed out)`;
      job.completedAt = new Date();

      await job.save();

      // Notify callback (e.g., to broadcast SSE events)
      if (this.onSessionMarkedStale) {
        this.onSessionMarkedStale(job.sessionId);
      }
    }

    return staleJobs.length;
  }
}
