import { Request, Response } from 'express';
import PushSubscription from '../models/PushSubscription';
import { getVapidPublicKey, sendToUser } from '../services/pushService';
import { createLogger } from '../utils/logger';

const logger = createLogger('PUSH');

/**
 * GET /push/vapid-key
 * Returns the public VAPID key for client-side subscription. No auth required.
 */
export const getVapidKey = async (_req: Request, res: Response) => {
  try {
    const key = getVapidPublicKey();
    if (!key) {
      return res.status(503).json({
        success: false,
        message: 'Push notifications are not configured',
      });
    }
    return res.status(200).json({ success: true, vapidPublicKey: key });
  } catch (error: any) {
    logger.error('Error fetching VAPID key:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching VAPID key',
    });
  }
};

/**
 * POST /push/subscribe
 * Store a push subscription for the authenticated user.
 */
export const subscribe = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { endpoint, keys, userAgent } = req.body;

    if (!endpoint || !keys || !keys.p256dh || !keys.auth) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: endpoint, keys.p256dh, keys.auth',
      });
    }

    const userId = req.user.id;

    // Upsert: if endpoint already exists, update it (could be a re-subscribe)
    const subscription = await PushSubscription.findOneAndUpdate(
      { endpoint },
      {
        userId,
        endpoint,
        keys: { p256dh: keys.p256dh, auth: keys.auth },
        userAgent: userAgent || undefined,
        failCount: 0,
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    );

    return res.status(201).json({
      success: true,
      data: {
        id: subscription._id,
        endpoint: subscription.endpoint,
        createdAt: subscription.createdAt,
      },
    });
  } catch (error: any) {
    logger.error('Error subscribing push:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while subscribing',
    });
  }
};

/**
 * DELETE /push/unsubscribe
 * Remove a push subscription for the authenticated user.
 */
export const unsubscribe = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { endpoint } = req.body;

    if (!endpoint) {
      return res.status(400).json({
        success: false,
        message: 'Missing required field: endpoint',
      });
    }

    const userId = req.user.id;
    const deleted = await PushSubscription.findOneAndDelete({ endpoint, userId });

    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Subscription not found',
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Unsubscribed successfully',
    });
  } catch (error: any) {
    logger.error('Error unsubscribing push:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while unsubscribing',
    });
  }
};

/**
 * POST /push/test
 * Send a test notification to the current user. Auth required.
 */
export const testPush = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const userId = req.user.id;
    const result = await sendToUser(userId, {
      title: 'Test Notification',
      body: 'Push notifications are working!',
      url: '/',
      tag: 'test',
    });

    return res.status(200).json({
      success: true,
      data: result,
    });
  } catch (error: any) {
    logger.error('Error sending test push:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while sending test notification',
    });
  }
};
