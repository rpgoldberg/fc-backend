/**
 * Integration tests for Sync Routes Phase-Change Webhook
 *
 * Tests POST /sync/webhook/phase-change endpoint
 */
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import syncRoutes, { getWebhookSecret } from '../../src/routes/syncRoutes';
import { SyncJob } from '../../src/models';

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

describe('Sync Routes - Phase Change Webhook', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testSessionId: string;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId();
    testSessionId = 'phase-test-' + Math.random().toString(36).substring(7);
  });

  afterEach(async () => {
    await SyncJob.deleteMany({});
  });

  describe('POST /sync/webhook/phase-change', () => {
    it('should update job phase when valid phase-change webhook received', async () => {
      // Create a SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'validating',
        items: []
      });

      const webhookBody = {
        sessionId: testSessionId,
        phase: 'queueing',
        message: 'Queueing items for processing'
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify job phase was updated
      const job = await SyncJob.findOne({ sessionId: testSessionId });
      expect(job?.phase).toBe('queueing');
      expect(job?.message).toBe('Queueing items for processing');
    });

    it('should add items when provided during queueing phase', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'validating',
        items: []
      });

      const webhookBody = {
        sessionId: testSessionId,
        phase: 'queueing',
        message: 'Items queued',
        items: [
          { mfcId: '111', name: 'Figure A', collectionStatus: 'owned', isNsfw: false },
          { mfcId: '222', name: 'Figure B', collectionStatus: 'wished', isNsfw: true }
        ]
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify items were added
      const job = await SyncJob.findOne({ sessionId: testSessionId });
      expect(job?.items).toHaveLength(2);
      expect(job?.items[0].mfcId).toBe('111');
      expect(job?.items[0].status).toBe('pending');
      expect(job?.items[0].collectionStatus).toBe('owned');
      expect(job?.items[1].mfcId).toBe('222');
      expect(job?.items[1].collectionStatus).toBe('wished');
      expect(job?.items[1].isNsfw).toBe(true);
    });

    it('should accept completed phase from scraper when job has no items (lists-only sync)', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'queueing',
        items: []
      });

      const webhookBody = {
        sessionId: testSessionId,
        phase: 'completed',
        message: 'Sync complete: 7 lists synced, no figures to enrich'
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.ignored).toBeUndefined();

      // Verify job phase WAS changed to completed
      const job = await SyncJob.findOne({ sessionId: testSessionId });
      expect(job?.phase).toBe('completed');
      expect(job?.message).toBe('Sync complete: 7 lists synced, no figures to enrich');
    });

    it('should ignore completed phase from scraper when job has items', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [{
          mfcId: '12345',
          name: 'Test Figure',
          status: 'pending',
          collectionStatus: 'owned',
          isNsfw: false,
          retryCount: 0
        }]
      });

      const webhookBody = {
        sessionId: testSessionId,
        phase: 'completed',
        message: 'All done'
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.ignored).toBe(true);

      // Verify job phase was NOT changed to completed
      const job = await SyncJob.findOne({ sessionId: testSessionId });
      expect(job?.phase).toBe('enriching');
    });

    it('should ignore failed terminal phase from scraper', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: []
      });

      const webhookBody = {
        sessionId: testSessionId,
        phase: 'failed',
        message: 'Sync failed'
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.ignored).toBe(true);
    });

    it('should return 401 for invalid webhook signature', async () => {
      const webhookBody = {
        sessionId: testSessionId,
        phase: 'queueing'
      };

      const invalidSignature = 'a'.repeat(64);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', invalidSignature)
        .send(webhookBody)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should return 400 for missing required fields', async () => {
      const webhookBody = {
        sessionId: testSessionId
        // Missing phase
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Missing required fields: sessionId, phase');
    });

    it('should return 404 when SyncJob not found', async () => {
      const webhookBody = {
        sessionId: 'nonexistent-session',
        phase: 'queueing'
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/phase-change')
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
        phase: 'queueing'
      };

      const signature = generateWebhookSignature(webhookBody);

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .post('/sync/webhook/phase-change')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(500);

      expect(response.body.success).toBe(false);

      // Restore
      (SyncJob.findOne as any) = originalFindOne;
      consoleErrorSpy.mockRestore();
    });
  });
});
