/**
 * Integration tests for Sync Routes Lists-Sync Webhook
 *
 * Tests POST /sync/webhook/lists-sync endpoint
 */
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import syncRoutes, { getWebhookSecret } from '../../src/routes/syncRoutes';
import { SyncJob, MfcList } from '../../src/models';

// Create test app with sync routes
const createSyncTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/sync', syncRoutes);
  return app;
};

const app = createSyncTestApp();

// Helper to generate valid webhook signature
const generateWebhookSignature = (body: Record<string, unknown>): string => {
  const secret = getWebhookSecret();
  return crypto
    .createHmac('sha256', secret)
    .update(JSON.stringify(body))
    .digest('hex');
};

describe('Sync Routes - Lists Sync Webhook', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testSessionId: string;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId();
    testSessionId = 'lists-test-' + Math.random().toString(36).substring(7);
  });

  afterEach(async () => {
    await SyncJob.deleteMany({});
    await MfcList.deleteMany({});
  });

  describe('POST /sync/webhook/lists-sync', () => {
    it('should upsert lists and return count when valid webhook received', async () => {
      // Create a SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: []
      });

      const webhookBody = {
        sessionId: testSessionId,
        lists: [
          {
            mfcId: 100,
            name: 'My Wishlist',
            teaser: 'Figures I want',
            privacy: 'public',
            itemMfcIds: [1, 2, 3]
          },
          {
            mfcId: 200,
            name: 'For Sale',
            teaser: 'Selling these',
            privacy: 'friends',
            itemCount: 5
          }
        ]
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.upserted).toBe(2);

      // Verify lists were created in the database
      const lists = await MfcList.find({ userId: testUserId }).sort({ mfcId: 1 });
      expect(lists).toHaveLength(2);

      // First list: itemCount derived from itemMfcIds.length
      expect(lists[0].mfcId).toBe(100);
      expect(lists[0].name).toBe('My Wishlist');
      expect(lists[0].teaser).toBe('Figures I want');
      expect(lists[0].privacy).toBe('public');
      expect(lists[0].itemMfcIds).toEqual([1, 2, 3]);
      expect(lists[0].itemCount).toBe(3);
      expect(lists[0].lastSyncedAt).toBeDefined();

      // Second list: itemCount from payload (no itemMfcIds)
      expect(lists[1].mfcId).toBe(200);
      expect(lists[1].name).toBe('For Sale');
      expect(lists[1].itemCount).toBe(5);
    });

    it('should upsert (update) existing lists on re-sync', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: []
      });

      // Pre-create a list
      await MfcList.create({
        userId: testUserId,
        mfcId: 100,
        name: 'Old Name',
        itemCount: 0,
        itemMfcIds: []
      });

      const webhookBody = {
        sessionId: testSessionId,
        lists: [
          {
            mfcId: 100,
            name: 'Updated Name',
            teaser: 'Now with teaser',
            itemMfcIds: [10, 20]
          }
        ]
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.upserted).toBe(1);

      // Verify list was updated, not duplicated
      const lists = await MfcList.find({ userId: testUserId });
      expect(lists).toHaveLength(1);
      expect(lists[0].name).toBe('Updated Name');
      expect(lists[0].teaser).toBe('Now with teaser');
      expect(lists[0].itemMfcIds).toEqual([10, 20]);
      expect(lists[0].itemCount).toBe(2);
    });

    it('should return 401 for invalid webhook signature', async () => {
      const webhookBody = {
        sessionId: testSessionId,
        lists: [{ mfcId: 1, name: 'Test' }]
      };

      const invalidSignature = 'a'.repeat(64);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', invalidSignature)
        .send(webhookBody)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should return 400 for missing sessionId', async () => {
      const webhookBody = {
        lists: [{ mfcId: 1, name: 'Test' }]
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Missing required fields: sessionId, lists');
    });

    it('should return 400 for missing lists', async () => {
      const webhookBody = {
        sessionId: testSessionId
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Missing required fields: sessionId, lists');
    });

    it('should return 400 when lists is not an array', async () => {
      const webhookBody = {
        sessionId: testSessionId,
        lists: 'not-an-array'
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Missing required fields: sessionId, lists');
    });

    it('should return 404 when SyncJob not found', async () => {
      const webhookBody = {
        sessionId: 'nonexistent-session',
        lists: [{ mfcId: 1, name: 'Test' }]
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('SyncJob not found');
    });

    it('should return 500 when database error occurs', async () => {
      // Temporarily mock SyncJob.findOne to throw
      const originalFindOne = SyncJob.findOne;
      (SyncJob.findOne as any) = jest.fn().mockRejectedValue(new Error('DB connection lost'));

      const webhookBody = {
        sessionId: testSessionId,
        lists: [{ mfcId: 1, name: 'Test' }]
      };

      const signature = generateWebhookSignature(webhookBody);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('DB connection lost');

      // Restore
      (SyncJob.findOne as any) = originalFindOne;
      consoleErrorSpy.mockRestore();
    });

    it('should handle empty lists array', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: []
      });

      const webhookBody = {
        sessionId: testSessionId,
        lists: []
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/lists-sync')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.upserted).toBe(0);
    });
  });
});
