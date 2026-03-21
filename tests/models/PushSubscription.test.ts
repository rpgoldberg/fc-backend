import mongoose from 'mongoose';
import PushSubscription from '../../src/models/PushSubscription';
import User from '../../src/models/User';

describe('PushSubscription Model', () => {
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    const testUser = new User({
      username: 'pushuser',
      email: 'push@example.com',
      password: 'password123',
    });
    const saved = await testUser.save();
    testUserId = saved._id;
  });

  const getValidData = () => ({
    userId: testUserId,
    endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint-123',
    keys: {
      p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfW0A',
      auth: 'tBHItJI5svbpC7Ycf5A2lQ',
    },
  });

  describe('Schema Validation', () => {
    it('should create a valid push subscription with required fields', async () => {
      const sub = new PushSubscription(getValidData());
      const saved = await sub.save();

      expect(saved._id).toBeDefined();
      expect(saved.userId).toEqual(testUserId);
      expect(saved.endpoint).toBe('https://fcm.googleapis.com/fcm/send/test-endpoint-123');
      expect(saved.keys.p256dh).toBeDefined();
      expect(saved.keys.auth).toBeDefined();
      expect(saved.failCount).toBe(0);
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });

    it('should save optional userAgent field', async () => {
      const data = { ...getValidData(), userAgent: 'Mozilla/5.0 (Android)' };
      const sub = new PushSubscription(data);
      const saved = await sub.save();

      expect(saved.userAgent).toBe('Mozilla/5.0 (Android)');
    });

    it('should save optional lastUsedAt field', async () => {
      const now = new Date();
      const data = { ...getValidData(), lastUsedAt: now };
      const sub = new PushSubscription(data);
      const saved = await sub.save();

      expect(saved.lastUsedAt).toEqual(now);
    });

    it('should default failCount to 0', async () => {
      const sub = new PushSubscription(getValidData());
      const saved = await sub.save();

      expect(saved.failCount).toBe(0);
    });

    it('should require userId', async () => {
      const data = getValidData();
      delete (data as any).userId;
      const sub = new PushSubscription(data);
      await expect(sub.save()).rejects.toThrow();
    });

    it('should require endpoint', async () => {
      const data = getValidData();
      delete (data as any).endpoint;
      const sub = new PushSubscription(data);
      await expect(sub.save()).rejects.toThrow();
    });

    it('should require keys.p256dh', async () => {
      const data = getValidData();
      delete (data as any).keys.p256dh;
      const sub = new PushSubscription(data);
      await expect(sub.save()).rejects.toThrow();
    });

    it('should require keys.auth', async () => {
      const data = getValidData();
      delete (data as any).keys.auth;
      const sub = new PushSubscription(data);
      await expect(sub.save()).rejects.toThrow();
    });

    it('should enforce unique endpoint', async () => {
      const data = getValidData();
      await new PushSubscription(data).save();

      const duplicate = new PushSubscription({
        ...data,
        userId: new mongoose.Types.ObjectId(),
      });
      await expect(duplicate.save()).rejects.toThrow();
    });
  });

  describe('Indexes', () => {
    it('should efficiently query by userId', async () => {
      // Create multiple subscriptions for different users
      const otherUserId = new mongoose.Types.ObjectId();
      await PushSubscription.create([
        {
          ...getValidData(),
          endpoint: 'https://push.example.com/sub1',
        },
        {
          userId: otherUserId,
          endpoint: 'https://push.example.com/sub2',
          keys: getValidData().keys,
        },
        {
          ...getValidData(),
          endpoint: 'https://push.example.com/sub3',
        },
      ]);

      const results = await PushSubscription.find({ userId: testUserId });
      expect(results).toHaveLength(2);
    });

    it('should support querying by failCount for cleanup', async () => {
      await PushSubscription.create([
        { ...getValidData(), endpoint: 'https://push.example.com/ok', failCount: 0 },
        { ...getValidData(), endpoint: 'https://push.example.com/failing', failCount: 5 },
        { ...getValidData(), endpoint: 'https://push.example.com/bad', failCount: 10 },
      ]);

      const failing = await PushSubscription.find({ failCount: { $gte: 5 } });
      expect(failing).toHaveLength(2);
    });
  });
});
