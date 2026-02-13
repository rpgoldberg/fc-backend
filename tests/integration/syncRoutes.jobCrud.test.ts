/**
 * Integration tests for Sync Routes Job CRUD Endpoints
 *
 * Tests:
 * - POST /sync/job - Create a new sync job
 * - GET /sync/job/:sessionId - Get sync job state
 * - GET /sync/stream/:sessionId - SSE stream setup
 */
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import syncRoutes from '../../src/routes/syncRoutes';
import { SyncJob, User } from '../../src/models';
import { generateTestToken } from '../setup';

// Mock global fetch
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Test user ID
const TEST_USER_ID = '507f1f77bcf86cd799439030';

// Create test app with sync routes
const createSyncTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/sync', syncRoutes);
  return app;
};

const app = createSyncTestApp();

describe('Sync Routes - Job CRUD', () => {
  let testUserId: mongoose.Types.ObjectId;
  let authToken: string;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId(TEST_USER_ID);
    authToken = generateTestToken(TEST_USER_ID);
    jest.clearAllMocks();

    await User.create({
      _id: testUserId,
      username: 'jobcrudtest',
      email: 'jobcrud@example.com',
      password: 'hashedpassword123'
    });

    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });
  });

  afterEach(async () => {
    await SyncJob.deleteMany({});
    await User.deleteMany({});
  });

  describe('POST /sync/job', () => {
    it('should create a new sync job', async () => {
      const response = await request(app)
        .post('/sync/job')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          sessionId: 'new-session-123',
          includeLists: ['owned', 'ordered'],
          skipCached: true
        })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.job).toBeDefined();
      expect(response.body.job.sessionId).toBe('new-session-123');
      expect(response.body.job.phase).toBe('validating');
      expect(response.body.webhookUrl).toContain('/sync/webhook');
      expect(response.body.webhookSecret).toBeDefined();

      // Verify job was saved in database
      const job = await SyncJob.findOne({ sessionId: 'new-session-123' });
      expect(job).toBeTruthy();
      expect(job?.userId.toString()).toBe(TEST_USER_ID);
      expect(job?.phase).toBe('validating');
    });

    it('should return 400 when sessionId is missing', async () => {
      const response = await request(app)
        .post('/sync/job')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('sessionId is required');
    });

    it('should return existing active job instead of creating duplicate', async () => {
      // Create an active SyncJob first
      await SyncJob.create({
        userId: testUserId,
        sessionId: 'existing-session',
        phase: 'enriching',
        items: [
          { mfcId: '111', status: 'pending', collectionStatus: 'owned', retryCount: 0 }
        ]
      });

      const response = await request(app)
        .post('/sync/job')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: 'existing-session' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.existing).toBe(true);
    });

    it('should replace completed job with new one', async () => {
      // Create a completed SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: 'completed-session',
        phase: 'completed',
        completedAt: new Date(),
        items: []
      });

      const response = await request(app)
        .post('/sync/job')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: 'completed-session' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.existing).toBeUndefined();
      expect(response.body.job.phase).toBe('validating');

      // Verify only one job exists
      const jobs = await SyncJob.find({ sessionId: 'completed-session' });
      expect(jobs).toHaveLength(1);
      expect(jobs[0].phase).toBe('validating');
    });

    it('should use default values for includeLists and skipCached', async () => {
      const response = await request(app)
        .post('/sync/job')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: 'defaults-session' })
        .expect(200);

      expect(response.body.success).toBe(true);

      const job = await SyncJob.findOne({ sessionId: 'defaults-session' });
      expect(job?.includeLists).toEqual(['owned', 'ordered', 'wished']);
      expect(job?.skipCached).toBe(false);
    });
  });

  describe('GET /sync/job/:sessionId', () => {
    it('should return sync job state', async () => {
      await SyncJob.create({
        userId: testUserId,
        sessionId: 'get-session-123',
        phase: 'enriching',
        message: 'Processing items',
        stats: { pending: 5, processing: 2, completed: 10, failed: 0, skipped: 0 },
        items: []
      });

      const response = await request(app)
        .get('/sync/job/get-session-123')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.job).toBeDefined();
      expect(response.body.job.sessionId).toBe('get-session-123');
      expect(response.body.job.phase).toBe('enriching');
      expect(response.body.job.message).toBe('Processing items');
    });

    it('should return 404 when job not found', async () => {
      const response = await request(app)
        .get('/sync/job/nonexistent-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('SyncJob not found');
    });

    it('should not return job belonging to another user', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      await SyncJob.create({
        userId: otherUserId,
        sessionId: 'other-user-session',
        phase: 'enriching',
        items: []
      });

      const response = await request(app)
        .get('/sync/job/other-user-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /sync/job/:sessionId - error handling', () => {
    it('should return 500 on database error', async () => {
      const originalFindOne = SyncJob.findOne;
      (SyncJob.findOne as any) = jest.fn().mockRejectedValue(new Error('DB failure'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .get('/sync/job/any-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('DB failure');

      (SyncJob.findOne as any) = originalFindOne;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('GET /sync/active-job - error handling', () => {
    it('should return 500 on database error', async () => {
      const originalFindOne = SyncJob.findOne;
      (SyncJob.findOne as any) = jest.fn().mockReturnValue({
        sort: jest.fn().mockRejectedValue(new Error('Active job DB failure'))
      });

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .get('/sync/active-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);

      (SyncJob.findOne as any) = originalFindOne;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('POST /sync/job - error handling', () => {
    it('should return 500 on database error during job creation', async () => {
      const originalCreate = SyncJob.create;
      const originalFindOne = SyncJob.findOne;
      (SyncJob.findOne as any) = jest.fn().mockResolvedValue(null);
      (SyncJob.create as any) = jest.fn().mockRejectedValue(new Error('Create job DB failure'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .post('/sync/job')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: 'error-session' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Create job DB failure');

      (SyncJob.create as any) = originalCreate;
      (SyncJob.findOne as any) = originalFindOne;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('DELETE /sync/job/:sessionId - error handling', () => {
    it('should return 500 on database error during cancel', async () => {
      const originalFindOne = SyncJob.findOne;
      (SyncJob.findOne as any) = jest.fn().mockRejectedValue(new Error('Cancel DB failure'));

      const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

      const response = await request(app)
        .delete('/sync/job/any-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);

      (SyncJob.findOne as any) = originalFindOne;
      consoleErrorSpy.mockRestore();
    });
  });

  describe('GET /sync/stream/:sessionId', () => {
    it('should return 404 when job not found for SSE stream', async () => {
      const response = await request(app)
        .get('/sync/stream/nonexistent-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('SyncJob not found');
    });

    it('should not return stream for job belonging to another user', async () => {
      const otherUserId = new mongoose.Types.ObjectId();
      await SyncJob.create({
        userId: otherUserId,
        sessionId: 'other-stream-session',
        phase: 'enriching',
        items: []
      });

      const response = await request(app)
        .get('/sync/stream/other-stream-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
    });
  });
});
