import { createLogger } from '../utils/logger';
import Notification from '../models/Notification';
import mongoose from 'mongoose';

const logger = createLogger('NOTIFICATION');

/**
 * Optional WebSocket import.
 * The websocketService may not exist on all branches (e.g. develop vs feature/websocket-live).
 * When absent, WebSocket delivery is silently skipped.
 */
let emitToUser: ((userId: string, event: string, data: unknown) => void) | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const ws = require('./websocketService');
  emitToUser = ws.emitToUser;
} catch {
  // websocketService not available on this branch
}

/**
 * Delivery channels for notifications.
 */
export type NotificationChannel = 'websocket' | 'push' | 'email';

/**
 * Notification payload for multi-channel delivery.
 */
export interface NotificationPayload {
  userId: string;
  type: 'price_alert' | 'sync_complete' | 'sync_error' | 'collection_update' | 'system';
  title: string;
  body: string;
  url?: string;
  data?: Record<string, unknown>;
  channels?: NotificationChannel[];
}

/**
 * Result of a multi-channel notification delivery attempt.
 */
export interface NotificationResult {
  notification: NotificationPayload;
  results: Record<string, boolean>;
  persisted: boolean;
}

/**
 * Unified notification delivery service.
 *
 * Sends notifications via multiple channels in parallel:
 * - WebSocket (instant, best-effort via Socket.IO)
 * - Push (future - persistent, survives app backgrounding)
 * - Email (future)
 *
 * All notifications are persisted to MongoDB for the in-app notification center.
 * Channel failures are logged but do not block other channels.
 */
class NotificationService {
  /**
   * Send a notification via all appropriate channels.
   * Channels are attempted in parallel; failures are logged but don't block.
   * The notification is also persisted to the database for the notification center.
   */
  async send(notification: NotificationPayload): Promise<NotificationResult> {
    const channels = notification.channels || ['websocket'];
    const results: Record<string, boolean> = {};

    // Persist notification to database for in-app notification center
    let persisted = false;
    try {
      await Notification.create({
        userId: new mongoose.Types.ObjectId(notification.userId),
        type: notification.type,
        title: notification.title,
        body: notification.body,
        url: notification.url,
        data: notification.data,
      });
      persisted = true;
    } catch (err) {
      logger.error('Failed to persist notification', err);
    }

    // WebSocket (instant, best-effort)
    if (channels.includes('websocket')) {
      try {
        if (emitToUser) {
          emitToUser(notification.userId, `notification:${notification.type}`, {
            title: notification.title,
            body: notification.body,
            url: notification.url,
            data: notification.data,
            timestamp: new Date().toISOString(),
          });
          results.websocket = true;
        } else {
          // WebSocket service not available
          results.websocket = false;
        }
      } catch (err) {
        logger.error('WebSocket delivery failed', err);
        results.websocket = false;
      }
    }

    // Push notification (future - persistent, survives app backgrounding)
    if (channels.includes('push')) {
      // Push service not yet implemented
      results.push = false;
    }

    // Email (future)
    if (channels.includes('email')) {
      results.email = false;
    }

    return { notification, results, persisted };
  }

  /**
   * Send a price alert notification.
   */
  async sendPriceAlert(
    userId: string,
    figureId: string,
    figureName: string,
    price: number,
    currency: string,
    site: string
  ): Promise<NotificationResult> {
    return this.send({
      userId,
      type: 'price_alert',
      title: 'Price Alert!',
      body: `${figureName} is now ${new Intl.NumberFormat('en', { style: 'currency', currency }).format(price)} on ${site}`,
      url: `/prices/${figureId}`,
      data: { figureId, price, currency, site },
    });
  }

  /**
   * Send a sync completion notification.
   */
  async sendSyncComplete(
    userId: string,
    sessionId: string,
    stats: { completed: number; failed: number }
  ): Promise<NotificationResult> {
    return this.send({
      userId,
      type: 'sync_complete',
      title: 'Sync Complete',
      body: `${stats.completed} figures synced${stats.failed > 0 ? `, ${stats.failed} failed` : ''}`,
      url: '/',
      data: { sessionId, ...stats },
    });
  }

  /**
   * Send a back-in-stock notification.
   */
  async sendBackInStock(
    userId: string,
    figureId: string,
    figureName: string,
    site: string
  ): Promise<NotificationResult> {
    return this.send({
      userId,
      type: 'price_alert',
      title: 'Back in Stock!',
      body: `${figureName} is available on ${site}`,
      url: `/prices/${figureId}`,
      data: { figureId, site },
    });
  }
}

// Singleton
let instance: NotificationService | null = null;

export function getNotificationService(): NotificationService {
  if (!instance) instance = new NotificationService();
  return instance;
}

/**
 * Reset the singleton (for testing only).
 */
export function resetNotificationService(): void {
  instance = null;
}

/**
 * Inject a custom emitToUser function (for testing only).
 */
export function _setEmitToUser(fn: ((userId: string, event: string, data: unknown) => void) | null): void {
  emitToUser = fn;
}
