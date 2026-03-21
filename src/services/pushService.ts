import webPush from 'web-push';
import PushSubscription from '../models/PushSubscription';
import { createLogger } from '../utils/logger';

const logger = createLogger('PUSH');

// VAPID keys should be generated once and stored as env vars
// Generate with: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || '';
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || '';
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || 'mailto:admin@figurecollecting.com';

/**
 * Initialize the push service with VAPID credentials.
 * Call once at server startup.
 */
export function initializePushService(): void {
  if (VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY) {
    webPush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    logger.info('Initialized with VAPID keys');
  } else {
    logger.warn('VAPID keys not configured — push notifications disabled');
  }
}

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  url?: string;
  tag?: string;
  data?: Record<string, unknown>;
}

/**
 * Send a push notification to a single subscription.
 * Returns true on success, false if subscription is expired/invalid (should be removed).
 * Throws on transient failures.
 */
export async function sendPushNotification(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: PushPayload,
): Promise<boolean> {
  try {
    await webPush.sendNotification(
      { endpoint: subscription.endpoint, keys: subscription.keys },
      JSON.stringify(payload),
      { TTL: 86400 }, // 24 hour TTL
    );
    return true;
  } catch (err: any) {
    if (err.statusCode === 410 || err.statusCode === 404) {
      // Subscription expired or invalid — caller should remove it
      return false;
    }
    throw err;
  }
}

/**
 * Send a push notification to all registered subscriptions for a user.
 * Handles cleanup of expired and repeatedly-failing subscriptions.
 */
export async function sendToUser(
  userId: string,
  payload: PushPayload,
): Promise<{ sent: number; failed: number; removed: number }> {
  const subs = await PushSubscription.find({ userId });
  let sent = 0;
  let failed = 0;
  let removed = 0;

  for (const sub of subs) {
    try {
      const success = await sendPushNotification(sub, {
        ...payload,
        icon: payload.icon || '/icons/icon-192.png',
        badge: payload.badge || '/icons/badge-72.png',
      });
      if (success) {
        sent++;
        await PushSubscription.updateOne(
          { _id: sub._id },
          { lastUsedAt: new Date(), failCount: 0 },
        );
      } else {
        // Subscription expired — remove it
        await PushSubscription.deleteOne({ _id: sub._id });
        removed++;
      }
    } catch {
      failed++;
      await PushSubscription.updateOne(
        { _id: sub._id },
        { $inc: { failCount: 1 } },
      );
    }
  }

  // Cleanup subscriptions with too many failures
  const cleaned = await PushSubscription.deleteMany({
    userId,
    failCount: { $gte: 5 },
  });
  removed += cleaned.deletedCount;

  return { sent, failed, removed };
}

/**
 * Get the VAPID public key for client-side subscription.
 */
export function getVapidPublicKey(): string {
  return VAPID_PUBLIC_KEY;
}
