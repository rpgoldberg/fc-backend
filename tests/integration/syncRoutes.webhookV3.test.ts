/**
 * Integration tests for Sync Routes Webhook - Schema v3 MFC Fields
 *
 * Tests that the webhook/item-complete endpoint correctly maps
 * Schema v3 individual MFC fields (mfcTitle, origin, version,
 * category, classification, materials, tags).
 */
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import syncRoutes, { getWebhookSecret } from '../../src/routes/syncRoutes';
import { SyncJob, Figure } from '../../src/models';

// Create test app
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

describe('Sync Routes - Webhook v3 MFC Fields', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testSessionId: string;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId();
    testSessionId = 'v3-test-' + Math.random().toString(36).substring(7);
  });

  afterEach(async () => {
    await SyncJob.deleteMany({});
    await Figure.deleteMany({});
  });

  it('should map all Schema v3 MFC fields from scrapedData to Figure', async () => {
    await SyncJob.create({
      userId: testUserId,
      sessionId: testSessionId,
      phase: 'enriching',
      items: [
        {
          mfcId: '90001',
          name: 'V3 Figure',
          status: 'processing',
          collectionStatus: 'owned',
          retryCount: 0
        }
      ]
    });

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90001',
      status: 'completed',
      scrapedData: {
        name: 'Hatsune Miku - Magical Mirai 2024',
        manufacturer: 'Good Smile Company',
        mfcTitle: 'Magical Mirai 2024 ver.',
        origin: 'Vocaloid',
        version: 'Magical Mirai 2024',
        category: 'Scale',
        classification: '1/7',
        materials: 'ABS&PVC',
        tags: ['vocaloid', 'miku', 'magical-mirai'],
        scale: '1/7',
        imageUrl: 'https://example.com/miku-v3.jpg'
      }
    };

    const signature = generateWebhookSignature(webhookBody);

    const response = await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(200);

    expect(response.body.success).toBe(true);

    // Verify all v3 fields were saved
    const figure = await Figure.findOne({ userId: testUserId, mfcId: 90001 });
    expect(figure).toBeTruthy();
    expect(figure?.mfcTitle).toBe('Magical Mirai 2024 ver.');
    expect(figure?.origin).toBe('Vocaloid');
    expect(figure?.version).toBe('Magical Mirai 2024');
    expect(figure?.category).toBe('Scale');
    expect(figure?.classification).toBe('1/7');
    expect(figure?.materials).toBe('ABS&PVC');
    expect(figure?.tags).toEqual(['vocaloid', 'miku', 'magical-mirai']);
  });

  it('should handle partial v3 fields (only some present)', async () => {
    await SyncJob.create({
      userId: testUserId,
      sessionId: testSessionId,
      phase: 'enriching',
      items: [
        {
          mfcId: '90002',
          name: 'Partial V3',
          status: 'processing',
          collectionStatus: 'wished',
          retryCount: 0
        }
      ]
    });

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90002',
      status: 'completed',
      scrapedData: {
        name: 'Rem - Starting Life',
        origin: 'Re:Zero',
        category: 'Scale'
        // No mfcTitle, version, classification, materials, tags
      }
    };

    const signature = generateWebhookSignature(webhookBody);

    await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(200);

    const figure = await Figure.findOne({ userId: testUserId, mfcId: 90002 });
    expect(figure).toBeTruthy();
    expect(figure?.origin).toBe('Re:Zero');
    expect(figure?.category).toBe('Scale');
    // These should be undefined since not provided
    expect(figure?.mfcTitle).toBeUndefined();
    expect(figure?.version).toBeUndefined();
  });

  it('should not save tags when tags is not an array', async () => {
    await SyncJob.create({
      userId: testUserId,
      sessionId: testSessionId,
      phase: 'enriching',
      items: [
        {
          mfcId: '90003',
          name: 'Tags Test',
          status: 'processing',
          collectionStatus: 'owned',
          retryCount: 0
        }
      ]
    });

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90003',
      status: 'completed',
      scrapedData: {
        name: 'Tags Edge Case',
        tags: 'not-an-array' // Should be filtered out
      }
    };

    const signature = generateWebhookSignature(webhookBody);

    await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(200);

    const figure = await Figure.findOne({ userId: testUserId, mfcId: 90003 });
    expect(figure).toBeTruthy();
    // Tags should NOT contain the non-array value 'not-an-array'
    // (the webhook code checks Array.isArray before setting tags)
    if (figure?.tags && figure.tags.length > 0) {
      expect(figure.tags).not.toContain('not-an-array');
    }
  });

  it('should parse and map dimensions string "1/6, H=260mm" to Figure', async () => {
    await SyncJob.create({
      userId: testUserId,
      sessionId: testSessionId,
      phase: 'enriching',
      items: [
        {
          mfcId: '90010',
          name: 'Dimensions Full',
          status: 'processing',
          collectionStatus: 'owned',
          retryCount: 0
        }
      ]
    });

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90010',
      status: 'completed',
      scrapedData: {
        name: 'Dimension Test Figure',
        dimensions: '1/6, H=260mm'
      }
    };

    const signature = generateWebhookSignature(webhookBody);

    await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(200);

    const figure = await Figure.findOne({ userId: testUserId, mfcId: 90010 });
    expect(figure).toBeTruthy();
    expect(figure?.dimensions).toBeTruthy();
    expect(figure?.dimensions?.heightMm).toBe(260);
    expect(figure?.dimensions?.scaledHeight).toBe('1/6');
  });

  it('should parse dimensions string "H=260mm" (height only) to Figure', async () => {
    await SyncJob.create({
      userId: testUserId,
      sessionId: testSessionId,
      phase: 'enriching',
      items: [
        {
          mfcId: '90011',
          name: 'Dimensions Height Only',
          status: 'processing',
          collectionStatus: 'owned',
          retryCount: 0
        }
      ]
    });

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90011',
      status: 'completed',
      scrapedData: {
        name: 'Height Only Figure',
        dimensions: 'H=260mm'
      }
    };

    const signature = generateWebhookSignature(webhookBody);

    await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(200);

    const figure = await Figure.findOne({ userId: testUserId, mfcId: 90011 });
    expect(figure).toBeTruthy();
    expect(figure?.dimensions).toBeTruthy();
    expect(figure?.dimensions?.heightMm).toBe(260);
    expect(figure?.dimensions?.scaledHeight).toBeUndefined();
  });

  it('should parse dimensions string "1/7" (scale only) to Figure', async () => {
    await SyncJob.create({
      userId: testUserId,
      sessionId: testSessionId,
      phase: 'enriching',
      items: [
        {
          mfcId: '90012',
          name: 'Dimensions Scale Only',
          status: 'processing',
          collectionStatus: 'owned',
          retryCount: 0
        }
      ]
    });

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90012',
      status: 'completed',
      scrapedData: {
        name: 'Scale Only Figure',
        dimensions: '1/7'
      }
    };

    const signature = generateWebhookSignature(webhookBody);

    await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(200);

    const figure = await Figure.findOne({ userId: testUserId, mfcId: 90012 });
    expect(figure).toBeTruthy();
    expect(figure?.dimensions).toBeTruthy();
    expect(figure?.dimensions?.scaledHeight).toBe('1/7');
    expect(figure?.dimensions?.heightMm).toBeUndefined();
  });

  it('should not set dimensions when scrapedData.dimensions is absent', async () => {
    await SyncJob.create({
      userId: testUserId,
      sessionId: testSessionId,
      phase: 'enriching',
      items: [
        {
          mfcId: '90013',
          name: 'No Dimensions',
          status: 'processing',
          collectionStatus: 'owned',
          retryCount: 0
        }
      ]
    });

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90013',
      status: 'completed',
      scrapedData: {
        name: 'No Dimensions Figure'
        // No dimensions field
      }
    };

    const signature = generateWebhookSignature(webhookBody);

    await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(200);

    const figure = await Figure.findOne({ userId: testUserId, mfcId: 90013 });
    expect(figure).toBeTruthy();
    expect(figure?.dimensions).toBeUndefined();
  });

  it('should handle webhook processing error gracefully', async () => {
    // Don't create a SyncJob but use valid signature - the findOne+updateItemStatus chain should break
    // Actually let's trigger a generic error by making SyncJob.findOne throw
    const originalFindOne = SyncJob.findOne;
    (SyncJob.findOne as any) = jest.fn().mockRejectedValue(new Error('DB connection lost'));

    const webhookBody = {
      sessionId: testSessionId,
      mfcId: '90004',
      status: 'completed',
      scrapedData: { name: 'Error Test' }
    };

    const signature = generateWebhookSignature(webhookBody);

    const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    const response = await request(app)
      .post('/sync/webhook/item-complete')
      .set('x-webhook-signature', signature)
      .send(webhookBody)
      .expect(500);

    expect(response.body.success).toBe(false);

    // Restore
    (SyncJob.findOne as any) = originalFindOne;
    consoleErrorSpy.mockRestore();
  });
});
