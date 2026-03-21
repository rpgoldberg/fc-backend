import request from 'supertest';
import { createTestApp } from '../helpers/testApp';
import User from '../../src/models/User';
import PushSubscription from '../../src/models/PushSubscription';
import { generateTestToken } from '../testSetup';
import mongoose from 'mongoose';

// Ensure JWT_SECRET is set for auth middleware
process.env.JWT_SECRET = process.env.JWT_SECRET || 'test-secret-that-is-at-least-32-characters-long';

// Mock web-push to prevent actual push attempts
jest.mock('web-push', () => ({
  setVapidDetails: jest.fn(),
  sendNotification: jest.fn().mockResolvedValue({}),
}));

const app = createTestApp();

describe('Push Routes Integration', () => {
  let testUser: any;
  let authToken: string;

  beforeEach(async () => {
    const fixedUserId = new mongoose.Types.ObjectId('000000000000000000000888');
    testUser = new User({
      _id: fixedUserId,
      username: 'pushuser',
      email: 'push@example.com',
      password: 'password123',
    });
    await testUser.save();
    authToken = generateTestToken(testUser._id.toString());
  });

  // ─── GET /push/vapid-key ──────────────────────────────────────────────────

  describe('GET /push/vapid-key', () => {
    it('should return 503 when VAPID key is not configured', async () => {
      const response = await request(app)
        .get('/push/vapid-key')
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('not configured');
    });

    it('should not require authentication', async () => {
      // Should not return 401 even without token
      const response = await request(app)
        .get('/push/vapid-key');

      // Either 200 (if key configured) or 503 (if not) — not 401
      expect(response.status).not.toBe(401);
    });
  });

  // ─── POST /push/subscribe ─────────────────────────────────────────────────

  describe('POST /push/subscribe', () => {
    const validSubscription = {
      endpoint: 'https://fcm.googleapis.com/fcm/send/test-endpoint',
      keys: {
        p256dh: 'BNcRdreALRFXTkOOUHK1EtK2wtaz5Ry4YfYCA_0QTpQtUbVlUls0VJXg7A8u-Ts1XbjhazAkj7I99e8p8REfW0A',
        auth: 'tBHItJI5svbpC7Ycf5A2lQ',
      },
    };

    it('should create a push subscription', async () => {
      const response = await request(app)
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send(validSubscription)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.endpoint).toBe(validSubscription.endpoint);
      expect(response.body.data.id).toBeDefined();

      // Verify in database
      const saved = await PushSubscription.findOne({ endpoint: validSubscription.endpoint });
      expect(saved).not.toBeNull();
      expect(saved!.userId.toString()).toBe(testUser._id.toString());
    });

    it('should upsert when endpoint already exists', async () => {
      // First subscribe
      await request(app)
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send(validSubscription)
        .expect(201);

      // Subscribe again with same endpoint
      const response = await request(app)
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send(validSubscription)
        .expect(201);

      expect(response.body.success).toBe(true);

      // Should still be only one subscription
      const count = await PushSubscription.countDocuments({ endpoint: validSubscription.endpoint });
      expect(count).toBe(1);
    });

    it('should include optional userAgent', async () => {
      const response = await request(app)
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ ...validSubscription, userAgent: 'FC-Mobile/1.0' })
        .expect(201);

      expect(response.body.success).toBe(true);

      const saved = await PushSubscription.findOne({ endpoint: validSubscription.endpoint });
      expect(saved!.userAgent).toBe('FC-Mobile/1.0');
    });

    it('should return 400 for missing endpoint', async () => {
      const response = await request(app)
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ keys: validSubscription.keys })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toContain('Missing required fields');
    });

    it('should return 400 for missing keys', async () => {
      const response = await request(app)
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ endpoint: validSubscription.endpoint })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 400 for missing keys.p256dh', async () => {
      const response = await request(app)
        .post('/push/subscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({
          endpoint: validSubscription.endpoint,
          keys: { auth: 'test-auth' },
        })
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/push/subscribe')
        .set('Content-Type', 'application/json')
        .send(validSubscription)
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ─── DELETE /push/unsubscribe ─────────────────────────────────────────────

  describe('DELETE /push/unsubscribe', () => {
    const testEndpoint = 'https://fcm.googleapis.com/fcm/send/to-unsubscribe';

    beforeEach(async () => {
      await PushSubscription.create({
        userId: testUser._id,
        endpoint: testEndpoint,
        keys: { p256dh: 'test-key', auth: 'test-auth' },
      });
    });

    it('should remove a push subscription', async () => {
      const response = await request(app)
        .delete('/push/unsubscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ endpoint: testEndpoint })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toContain('Unsubscribed');

      const exists = await PushSubscription.findOne({ endpoint: testEndpoint });
      expect(exists).toBeNull();
    });

    it('should return 404 for non-existent subscription', async () => {
      const response = await request(app)
        .delete('/push/unsubscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({ endpoint: 'https://push.example.com/nonexistent' })
        .expect(404);

      expect(response.body.success).toBe(false);
    });

    it('should not allow deleting another user subscription', async () => {
      const otherUser = await User.create({
        username: 'other',
        email: 'other@example.com',
        password: 'password123',
      });
      const otherToken = generateTestToken(otherUser._id.toString());

      const response = await request(app)
        .delete('/push/unsubscribe')
        .set('Authorization', `Bearer ${otherToken}`)
        .set('Content-Type', 'application/json')
        .send({ endpoint: testEndpoint })
        .expect(404);

      expect(response.body.success).toBe(false);

      // Subscription should still exist
      const exists = await PushSubscription.findOne({ endpoint: testEndpoint });
      expect(exists).not.toBeNull();
    });

    it('should return 400 for missing endpoint', async () => {
      const response = await request(app)
        .delete('/push/unsubscribe')
        .set('Authorization', `Bearer ${authToken}`)
        .set('Content-Type', 'application/json')
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .delete('/push/unsubscribe')
        .set('Content-Type', 'application/json')
        .send({ endpoint: testEndpoint })
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });

  // ─── POST /push/test ──────────────────────────────────────────────────────

  describe('POST /push/test', () => {
    it('should send a test notification', async () => {
      // Create a subscription first
      await PushSubscription.create({
        userId: testUser._id,
        endpoint: 'https://fcm.googleapis.com/fcm/send/test-push',
        keys: { p256dh: 'test-key', auth: 'test-auth' },
      });

      const response = await request(app)
        .post('/push/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data).toHaveProperty('sent');
      expect(response.body.data).toHaveProperty('failed');
      expect(response.body.data).toHaveProperty('removed');
    });

    it('should return zero counts when user has no subscriptions', async () => {
      const response = await request(app)
        .post('/push/test')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.sent).toBe(0);
      expect(response.body.data.failed).toBe(0);
      expect(response.body.data.removed).toBe(0);
    });

    it('should return 401 without authentication', async () => {
      const response = await request(app)
        .post('/push/test')
        .expect(401);

      expect(response.body.success).toBe(false);
    });
  });
});
