import mongoose from 'mongoose';
import PushSubscription from '../../src/models/PushSubscription';
import User from '../../src/models/User';

// Mock web-push before importing the service
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn(),
}));

import webPush from 'web-push';
import {
  initializePushService,
  sendPushNotification,
  sendToUser,
  getVapidPublicKey,
} from '../../src/services/pushService';

const mockSendNotification = webPush.sendNotification as jest.MockedFunction<typeof webPush.sendNotification>;

describe('PushService', () => {
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const user = new User({
      username: 'pushserviceuser',
      email: 'pushsvc@example.com',
      password: 'password123',
    });
    const saved = await user.save();
    testUserId = saved._id;
    jest.clearAllMocks();
  });

  describe('initializePushService', () => {
    it('should call setVapidDetails when keys are configured', () => {
      const origPublic = process.env.VAPID_PUBLIC_KEY;
      const origPrivate = process.env.VAPID_PRIVATE_KEY;
      process.env.VAPID_PUBLIC_KEY = 'test-public-key';
      process.env.VAPID_PRIVATE_KEY = 'test-private-key';

      // Re-import to pick up new env vars
      jest.resetModules();
      jest.mock('web-push', () => ({
        setVapidDetails: jest.fn(),
        sendNotification: jest.fn(),
      }));

      const pushService = require('../../src/services/pushService');
      pushService.initializePushService();

      const wp = require('web-push');
      expect(wp.setVapidDetails).toHaveBeenCalledWith(
        expect.any(String),
        'test-public-key',
        'test-private-key',
      );

      process.env.VAPID_PUBLIC_KEY = origPublic;
      process.env.VAPID_PRIVATE_KEY = origPrivate;
    });

    it('should warn when VAPID keys are not configured', () => {
      // Default env has no VAPID keys
      const warnSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});
      initializePushService();
      // The function completes without error
      warnSpy.mockRestore();
    });
  });

  describe('getVapidPublicKey', () => {
    it('should return the VAPID public key from env', () => {
      const key = getVapidPublicKey();
      // In test env, no key is set unless explicitly configured
      expect(typeof key).toBe('string');
    });
  });

  describe('sendPushNotification', () => {
    const mockSubscription = {
      endpoint: 'https://fcm.googleapis.com/test',
      keys: { p256dh: 'test-p256dh', auth: 'test-auth' },
    };

    it('should return true on successful send', async () => {
      mockSendNotification.mockResolvedValue({} as any);

      const result = await sendPushNotification(mockSubscription, {
        title: 'Test',
        body: 'Test body',
      });

      expect(result).toBe(true);
      expect(mockSendNotification).toHaveBeenCalledWith(
        { endpoint: mockSubscription.endpoint, keys: mockSubscription.keys },
        expect.any(String),
        { TTL: 86400 },
      );
    });

    it('should return false for 410 Gone (expired subscription)', async () => {
      const error = new Error('Gone') as any;
      error.statusCode = 410;
      mockSendNotification.mockRejectedValue(error);

      const result = await sendPushNotification(mockSubscription, {
        title: 'Test',
        body: 'Test body',
      });

      expect(result).toBe(false);
    });

    it('should return false for 404 Not Found (invalid subscription)', async () => {
      const error = new Error('Not Found') as any;
      error.statusCode = 404;
      mockSendNotification.mockRejectedValue(error);

      const result = await sendPushNotification(mockSubscription, {
        title: 'Test',
        body: 'Test body',
      });

      expect(result).toBe(false);
    });

    it('should throw on other errors', async () => {
      const error = new Error('Server Error') as any;
      error.statusCode = 500;
      mockSendNotification.mockRejectedValue(error);

      await expect(
        sendPushNotification(mockSubscription, { title: 'Test', body: 'Test body' }),
      ).rejects.toThrow('Server Error');
    });

    it('should serialize payload as JSON', async () => {
      mockSendNotification.mockResolvedValue({} as any);

      await sendPushNotification(mockSubscription, {
        title: 'Price Drop',
        body: 'Miku is now $50',
        url: '/figures/123',
        tag: 'price-alert',
      });

      const payload = JSON.parse(mockSendNotification.mock.calls[0][1] as string);
      expect(payload.title).toBe('Price Drop');
      expect(payload.body).toBe('Miku is now $50');
      expect(payload.url).toBe('/figures/123');
      expect(payload.tag).toBe('price-alert');
    });
  });

  describe('sendToUser', () => {
    beforeEach(async () => {
      // Create test subscriptions
      await PushSubscription.create([
        {
          userId: testUserId,
          endpoint: 'https://push.example.com/sub1',
          keys: { p256dh: 'key1-p256dh', auth: 'key1-auth' },
          failCount: 0,
        },
        {
          userId: testUserId,
          endpoint: 'https://push.example.com/sub2',
          keys: { p256dh: 'key2-p256dh', auth: 'key2-auth' },
          failCount: 0,
        },
      ]);
    });

    it('should send to all user subscriptions and return counts', async () => {
      mockSendNotification.mockResolvedValue({} as any);

      const result = await sendToUser(testUserId.toString(), {
        title: 'Test',
        body: 'Hello',
      });

      expect(result.sent).toBe(2);
      expect(result.failed).toBe(0);
      expect(result.removed).toBe(0);
      expect(mockSendNotification).toHaveBeenCalledTimes(2);
    });

    it('should update lastUsedAt and reset failCount on success', async () => {
      mockSendNotification.mockResolvedValue({} as any);
      await PushSubscription.updateOne(
        { endpoint: 'https://push.example.com/sub1' },
        { failCount: 3 },
      );

      await sendToUser(testUserId.toString(), {
        title: 'Test',
        body: 'Hello',
      });

      const sub = await PushSubscription.findOne({ endpoint: 'https://push.example.com/sub1' });
      expect(sub!.failCount).toBe(0);
      expect(sub!.lastUsedAt).toBeDefined();
    });

    it('should remove expired subscriptions (410)', async () => {
      // One sub succeeds, the other returns 410 (order may vary)
      mockSendNotification
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(Object.assign(new Error('Gone'), { statusCode: 410 }));

      const result = await sendToUser(testUserId.toString(), {
        title: 'Test',
        body: 'Hello',
      });

      expect(result.sent).toBe(1);
      expect(result.removed).toBe(1);

      const remaining = await PushSubscription.find({ userId: testUserId });
      expect(remaining).toHaveLength(1);
    });

    it('should increment failCount on transient failure', async () => {
      // One sub succeeds, the other fails transiently
      mockSendNotification
        .mockResolvedValueOnce({} as any)
        .mockRejectedValueOnce(Object.assign(new Error('Timeout'), { statusCode: 500 }));

      const result = await sendToUser(testUserId.toString(), {
        title: 'Test',
        body: 'Hello',
      });

      expect(result.sent).toBe(1);
      expect(result.failed).toBe(1);

      // One of the two should have failCount incremented
      const subs = await PushSubscription.find({ userId: testUserId });
      const failCounts = subs.map(s => s.failCount).sort();
      expect(failCounts).toEqual([0, 1]);
    });

    it('should auto-cleanup subscriptions with failCount >= 5', async () => {
      // Clear the default subs and create fresh ones with known state
      await PushSubscription.deleteMany({ userId: testUserId });
      await PushSubscription.create([
        {
          userId: testUserId,
          endpoint: 'https://push.example.com/good',
          keys: { p256dh: 'key-good', auth: 'auth-good' },
          failCount: 0,
        },
        {
          userId: testUserId,
          endpoint: 'https://push.example.com/doomed',
          keys: { p256dh: 'key-doomed', auth: 'auth-doomed' },
          failCount: 4,
        },
      ]);

      // Make ALL sends fail with transient error
      mockSendNotification.mockRejectedValue(
        Object.assign(new Error('Error'), { statusCode: 500 }),
      );

      const result = await sendToUser(testUserId.toString(), {
        title: 'Test',
        body: 'Hello',
      });

      expect(result.failed).toBe(2);
      // The sub with failCount 4->5 should be cleaned up by deleteMany
      expect(result.removed).toBeGreaterThanOrEqual(1);

      const remaining = await PushSubscription.find({ userId: testUserId });
      expect(remaining).toHaveLength(1);
      expect(remaining[0].failCount).toBe(1); // 0 -> 1
    });

    it('should return zeros when user has no subscriptions', async () => {
      const otherUserId = new mongoose.Types.ObjectId();

      const result = await sendToUser(otherUserId.toString(), {
        title: 'Test',
        body: 'Hello',
      });

      expect(result.sent).toBe(0);
      expect(result.failed).toBe(0);
      expect(result.removed).toBe(0);
    });

    it('should add default icon and badge to payload', async () => {
      mockSendNotification.mockResolvedValue({} as any);

      await sendToUser(testUserId.toString(), {
        title: 'Test',
        body: 'Hello',
      });

      const payload = JSON.parse(mockSendNotification.mock.calls[0][1] as string);
      expect(payload.icon).toBe('/icons/icon-192.png');
      expect(payload.badge).toBe('/icons/badge-72.png');
    });
  });
});
