/**
 * Integration tests for Sync Routes Webhook Handler
 *
 * Tests the Figure save/update logic in webhook/item-complete endpoint
 */
import request from 'supertest';
import express from 'express';
import crypto from 'crypto';
import mongoose from 'mongoose';
import syncRoutes, { getWebhookSecret } from '../../src/routes/syncRoutes';
import { SyncJob, Figure, Company, Artist, RoleType } from '../../src/models';

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

describe('Sync Routes - Webhook Item Complete', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testSessionId: string;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId();
    testSessionId = 'test-session-' + Math.random().toString(36).substring(7);
  });

  afterEach(async () => {
    // Clean up test data
    await SyncJob.deleteMany({});
    await Figure.deleteMany({});
  });

  describe('POST /sync/webhook/item-complete - Figure Save Logic', () => {
    it('should save Figure when status is completed and scrapedData is present', async () => {
      // Create a SyncJob with an item
      const syncJob = await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '12345',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '12345',
        status: 'completed',
        scrapedData: {
          name: 'Scraped Figure Name',
          manufacturer: 'Good Smile Company',
          scale: '1/7',
          imageUrl: 'https://example.com/figure.jpg',
          description: 'A beautiful figure',
          releases: [{ date: '2024-01-01', price: 15000, currency: 'JPY' }],
          jan: '4580416940511'
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify Figure was created in database
      const figure = await Figure.findOne({ userId: testUserId, mfcId: 12345 });
      expect(figure).toBeTruthy();
      expect(figure?.name).toBe('Scraped Figure Name');
      expect(figure?.manufacturer).toBe('Good Smile Company');
      expect(figure?.scale).toBe('1/7');
      expect(figure?.imageUrl).toBe('https://example.com/figure.jpg');
      expect(figure?.description).toBe('A beautiful figure');
      expect(figure?.jan).toBe('4580416940511');
      expect(figure?.collectionStatus).toBe('owned');
      expect(figure?.mfcLink).toBe('https://myfigurecollection.net/item/12345');
    });

    it('should skip Figure save when status is not completed', async () => {
      // Create a SyncJob with an item
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '12345',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '12345',
        status: 'failed',
        error: 'Scraping failed',
        scrapedData: {
          name: 'Should Not Be Saved',
          manufacturer: 'Test Manufacturer'
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify Figure was NOT created
      const figure = await Figure.findOne({ userId: testUserId, mfcId: 12345 });
      expect(figure).toBeNull();
    });

    it('should skip Figure save when scrapedData is missing', async () => {
      // Create a SyncJob with an item
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '12345',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '12345',
        status: 'completed'
        // No scrapedData
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify Figure was NOT created
      const figure = await Figure.findOne({ userId: testUserId, mfcId: 12345 });
      expect(figure).toBeNull();
    });

    it('should handle Figure save error gracefully and still return 200', async () => {
      // Create a SyncJob with an item
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '12345',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      // Mock Figure.findOneAndUpdate to throw an error
      const originalFindOneAndUpdate = Figure.findOneAndUpdate;
      (Figure.findOneAndUpdate as any) = jest.fn().mockRejectedValue(new Error('Database error'));

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '12345',
        status: 'completed',
        scrapedData: {
          name: 'Test Figure',
          manufacturer: 'Test Manufacturer'
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      // Spy on console.error to verify error logging
      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      try {
        const response = await request(app)
          .post('/sync/webhook/item-complete')
          .set('x-webhook-signature', signature)
          .send(webhookBody)
          .expect(200);

        expect(response.body.success).toBe(true);
        // The route uses a single template literal with JSON.stringify-wrapped values
        expect(consoleErrorSpy).toHaveBeenCalledWith(
          expect.stringContaining('[WEBHOOK] Failed to save figure')
        );
      } finally {
        // Always restore mocks, even if assertions fail
        (Figure.findOneAndUpdate as any) = originalFindOneAndUpdate;
        consoleErrorSpy.mockRestore();
      }
    });

    it('should map all scraped data fields correctly to Figure schema', async () => {
      // Create a SyncJob with an item that has 'wished' collection status
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '67890',
            name: 'Wished Figure',
            status: 'processing',
            collectionStatus: 'wished',
            retryCount: 0
          }
        ]
      });

      const releases = [
        { date: '2023-06-01', price: 12000, currency: 'JPY', isRerelease: false },
        { date: '2024-01-15', price: 13000, currency: 'JPY', isRerelease: true }
      ];

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '67890',
        status: 'completed',
        scrapedData: {
          name: 'Rem Figure',
          manufacturer: 'Alter',
          scale: '1/8',
          imageUrl: 'https://example.com/rem.jpg',
          description: 'Rem from Re:Zero',
          releases: releases,
          jan: '4562474087521'
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 67890 });
      expect(figure).toBeTruthy();
      
      // Verify all field mappings
      expect(figure?.mfcId).toBe(67890);
      expect(figure?.mfcLink).toBe('https://myfigurecollection.net/item/67890');
      expect(figure?.name).toBe('Rem Figure');
      expect(figure?.manufacturer).toBe('Alter');
      expect(figure?.scale).toBe('1/8');
      expect(figure?.imageUrl).toBe('https://example.com/rem.jpg');
      expect(figure?.description).toBe('Rem from Re:Zero');
      expect(figure?.jan).toBe('4562474087521');
      expect(figure?.collectionStatus).toBe('wished');
      expect(figure?.releases).toHaveLength(2);
    });

    it('should use collectionStatus from job item, defaulting to owned', async () => {
      // Create a SyncJob with an item that has 'ordered' collection status
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '11111',
            name: 'Ordered Figure',
            status: 'processing',
            collectionStatus: 'ordered',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '11111',
        status: 'completed',
        scrapedData: {
          name: 'Ordered Test Figure',
          manufacturer: 'Max Factory'
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 11111 });
      expect(figure).toBeTruthy();
      expect(figure?.collectionStatus).toBe('ordered');
    });

    it('should update existing Figure instead of creating duplicate', async () => {
      // Create existing Figure
      await Figure.create({
        userId: testUserId,
        mfcId: 99999,
        name: 'Old Name',
        manufacturer: 'Old Manufacturer',
        mfcLink: 'https://myfigurecollection.net/item/99999',
        collectionStatus: 'owned'
      });

      // Create SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '99999',
            name: 'Update Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '99999',
        status: 'completed',
        scrapedData: {
          name: 'Updated Name',
          manufacturer: 'Updated Manufacturer',
          scale: '1/6'
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      // Verify only one Figure exists
      const figures = await Figure.find({ userId: testUserId, mfcId: 99999 });
      expect(figures).toHaveLength(1);
      
      // Verify fields were updated
      expect(figures[0].name).toBe('Updated Name');
      expect(figures[0].manufacturer).toBe('Updated Manufacturer');
      expect(figures[0].scale).toBe('1/6');
    });

    it('should convert mfcId string to number when saving Figure', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '55555',
            name: 'Test',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '55555', // String in webhook
        status: 'completed',
        scrapedData: {
          name: 'Numeric ID Test',
          manufacturer: 'Test'
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 55555 });
      expect(figure).toBeTruthy();
      expect(typeof figure?.mfcId).toBe('number');
      expect(figure?.mfcId).toBe(55555);
    });
  });

  describe('POST /sync/webhook/item-complete - Validation', () => {
    it('should reject request with invalid webhook signature', async () => {
      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '12345',
        status: 'completed'
      };

      // Create an invalid signature of correct length (64 hex chars for SHA256)
      const invalidSignature = 'a'.repeat(64);

      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', invalidSignature)
        .send(webhookBody)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should return 401 for missing webhook signature', async () => {
      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '12345',
        status: 'completed'
      };

      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .send(webhookBody)
        .expect(401);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid webhook signature');
    });

    it('should return 400 for missing required fields', async () => {
      const webhookBody = {
        sessionId: testSessionId
        // Missing mfcId and status
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Missing required fields: sessionId, mfcId, status');
    });

    it('should return 404 when SyncJob is not found', async () => {
      const webhookBody = {
        sessionId: 'nonexistent-session',
        mfcId: '12345',
        status: 'completed'
      };

      const signature = generateWebhookSignature(webhookBody);

      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('SyncJob not found');
    });
  });

  describe('POST /sync/webhook/item-complete - Optional Fields Handling', () => {
    it('should only include fields that are present in scrapedData', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '77777',
            name: 'Minimal Data',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      // Only provide name and manufacturer (minimal scrapedData)
      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '77777',
        status: 'completed',
        scrapedData: {
          name: 'Minimal Figure',
          manufacturer: 'Minimal Maker'
          // No scale, imageUrl, description, releases, or jan
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 77777 });
      expect(figure).toBeTruthy();
      expect(figure?.name).toBe('Minimal Figure');
      expect(figure?.manufacturer).toBe('Minimal Maker');
      expect(figure?.scale).toBeUndefined();
      expect(figure?.imageUrl).toBeUndefined();
      expect(figure?.description).toBeUndefined();
      expect(figure?.jan).toBeUndefined();
    });
  });

  describe('POST /sync/webhook/item-complete - Schema v3 Company/Artist Handling', () => {
    beforeEach(async () => {
      // Clean up Company, Artist, RoleType before each test
      await Company.deleteMany({});
      await Artist.deleteMany({});
      await RoleType.deleteMany({});

      // Seed the required role types for tests
      await RoleType.create([
        { name: 'Manufacturer', kind: 'company', isSystem: true, displayOrder: 1 },
        { name: 'Distributor', kind: 'company', isSystem: true, displayOrder: 2 },
        { name: 'Sculptor', kind: 'artist', isSystem: true, displayOrder: 1 },
        { name: 'Illustrator', kind: 'artist', isSystem: true, displayOrder: 2 },
        { name: 'Painter', kind: 'artist', isSystem: true, displayOrder: 3 },
        { name: 'Designer', kind: 'artist', isSystem: true, displayOrder: 4 }
      ]);
    });

    afterEach(async () => {
      await Company.deleteMany({});
      await Artist.deleteMany({});
      await RoleType.deleteMany({});
    });

    it('should create Company record when new company in scrapedData.companies', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88001',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88001',
        status: 'completed',
        scrapedData: {
          name: 'Figure with Company',
          companies: [
            { name: 'Good Smile Company', role: 'Manufacturer', mfcId: 123 }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      // Verify Company was created
      const company = await Company.findOne({ name: 'Good Smile Company' });
      expect(company).toBeTruthy();
      expect(company?.mfcId).toBe(123);
    });

    it('should reuse existing Company when name matches', async () => {
      // Get the Manufacturer role type (created in beforeEach)
      const manufacturerRole = await RoleType.findOne({ name: 'Manufacturer' });

      // Pre-create a company with required fields
      const existingCompany = await Company.create({
        name: 'Max Factory',
        category: 'company',
        subType: manufacturerRole!._id,
        mfcId: 456
      });

      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88002',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88002',
        status: 'completed',
        scrapedData: {
          name: 'Figure with Existing Company',
          companies: [
            { name: 'Max Factory', role: 'Manufacturer' }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      // Verify only one Company exists (reused, not duplicated)
      const companies = await Company.find({ name: 'Max Factory' });
      expect(companies).toHaveLength(1);
      expect(companies[0]._id.toString()).toBe(existingCompany._id.toString());
    });

    it('should populate Figure.companyRoles with ObjectId references', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88003',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88003',
        status: 'completed',
        scrapedData: {
          name: 'Figure with CompanyRoles',
          companies: [
            { name: 'Alter', role: 'Manufacturer' }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 88003 });
      expect(figure).toBeTruthy();
      expect(figure?.companyRoles).toHaveLength(1);
      expect(figure?.companyRoles?.[0].companyName).toBe('Alter');
      expect(figure?.companyRoles?.[0].roleName).toBe('Manufacturer');
      expect(figure?.companyRoles?.[0].companyId).toBeDefined();
      expect(figure?.companyRoles?.[0].roleId).toBeDefined();
    });

    it('should create Artist records from scrapedData.artists', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88004',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88004',
        status: 'completed',
        scrapedData: {
          name: 'Figure with Artist',
          artists: [
            { name: 'TERAOKA Takeyuki', role: 'Sculptor', mfcId: 789 }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      // Verify Artist was created
      const artist = await Artist.findOne({ name: 'TERAOKA Takeyuki' });
      expect(artist).toBeTruthy();
      expect(artist?.mfcId).toBe(789);
    });

    it('should populate Figure.artistRoles with ObjectId references', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88005',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88005',
        status: 'completed',
        scrapedData: {
          name: 'Figure with ArtistRoles',
          artists: [
            { name: 'KEI', role: 'Illustrator' }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 88005 });
      expect(figure).toBeTruthy();
      expect(figure?.artistRoles).toHaveLength(1);
      expect(figure?.artistRoles?.[0].artistName).toBe('KEI');
      expect(figure?.artistRoles?.[0].roleName).toBe('Illustrator');
      expect(figure?.artistRoles?.[0].artistId).toBeDefined();
      expect(figure?.artistRoles?.[0].roleId).toBeDefined();
    });

    it('should still set manufacturer string for backward compatibility', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88006',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88006',
        status: 'completed',
        scrapedData: {
          name: 'Figure with Both Formats',
          companies: [
            { name: 'Kotobukiya', role: 'Manufacturer' }
          ]
          // No explicit manufacturer field - should be derived from companies
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 88006 });
      expect(figure).toBeTruthy();
      // Legacy manufacturer should be set from first Manufacturer company
      expect(figure?.manufacturer).toBe('Kotobukiya');
      // v3 companyRoles should also be populated
      expect(figure?.companyRoles).toHaveLength(1);
    });

    it('should handle multiple companies with different roles', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88007',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88007',
        status: 'completed',
        scrapedData: {
          name: 'Figure with Multiple Companies',
          companies: [
            { name: 'Good Smile Company', role: 'Manufacturer' },
            { name: 'AmiAmi', role: 'Distributor' }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 88007 });
      expect(figure).toBeTruthy();
      expect(figure?.companyRoles).toHaveLength(2);

      const manufacturerRole = figure?.companyRoles?.find(r => r.roleName === 'Manufacturer');
      const distributorRole = figure?.companyRoles?.find(r => r.roleName === 'Distributor');

      expect(manufacturerRole?.companyName).toBe('Good Smile Company');
      expect(distributorRole?.companyName).toBe('AmiAmi');
    });

    it('should handle multiple artists with different roles', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88008',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88008',
        status: 'completed',
        scrapedData: {
          name: 'Figure with Multiple Artists',
          artists: [
            { name: 'Sculptor A', role: 'Sculptor' },
            { name: 'Illustrator B', role: 'Illustrator' },
            { name: 'Painter C', role: 'Painter' }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      const figure = await Figure.findOne({ userId: testUserId, mfcId: 88008 });
      expect(figure).toBeTruthy();
      expect(figure?.artistRoles).toHaveLength(3);

      const sculptorRole = figure?.artistRoles?.find(r => r.roleName === 'Sculptor');
      const illustratorRole = figure?.artistRoles?.find(r => r.roleName === 'Illustrator');
      const painterRole = figure?.artistRoles?.find(r => r.roleName === 'Painter');

      expect(sculptorRole?.artistName).toBe('Sculptor A');
      expect(illustratorRole?.artistName).toBe('Illustrator B');
      expect(painterRole?.artistName).toBe('Painter C');
    });

    it('should gracefully handle unknown role types', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          {
            mfcId: '88009',
            name: 'Test Figure',
            status: 'processing',
            collectionStatus: 'owned',
            retryCount: 0
          }
        ]
      });

      const webhookBody = {
        sessionId: testSessionId,
        mfcId: '88009',
        status: 'completed',
        scrapedData: {
          name: 'Figure with Unknown Role',
          companies: [
            { name: 'Unknown Co', role: 'UnknownRoleType' }
          ]
        }
      };

      const signature = generateWebhookSignature(webhookBody);

      // Should still succeed - graceful handling
      const response = await request(app)
        .post('/sync/webhook/item-complete')
        .set('x-webhook-signature', signature)
        .send(webhookBody)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Figure should still be saved with name stored but no roleId
      const figure = await Figure.findOne({ userId: testUserId, mfcId: 88009 });
      expect(figure).toBeTruthy();
      // companyRoles entry should have name but roleId may be undefined
      expect(figure?.companyRoles?.[0]?.companyName).toBe('Unknown Co');
    });
  });
});
