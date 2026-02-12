/**
 * Integration tests for GET /sync/active-job endpoint
 *
 * This endpoint allows the frontend to find the user's active sync job
 * without knowing the session ID - used for session recovery after
 * page refresh or SSE disconnection.
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

// Test user ID - must be valid 24-char hex string
const TEST_USER_ID = '507f1f77bcf86cd799439012';

// Create test app with sync routes
const createSyncTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/sync', syncRoutes);
  return app;
};

const app = createSyncTestApp();

describe('Sync Routes - Active Job Recovery', () => {
  let testUserId: mongoose.Types.ObjectId;
  let authToken: string;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId(TEST_USER_ID);
    authToken = generateTestToken(TEST_USER_ID);
    jest.clearAllMocks();

    // Create test user in database
    await User.create({
      _id: testUserId,
      username: 'activejobtest',
      email: 'activejobtest@example.com',
      password: 'hashedpassword123'
    });

    // Default mock for scraper responses
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true })
    });
  });

  afterEach(async () => {
    await SyncJob.deleteMany({});
    await User.deleteMany({});
  });

  describe('GET /sync/active-job', () => {
    it('should return active job when user has one in progress', async () => {
      // Create an active SyncJob
      const sessionId = 'recovery-session-' + Date.now();
      await SyncJob.create({
        userId: testUserId,
        sessionId,
        phase: 'enriching',
        message: 'Enriching items...',
        stats: { pending: 5, processing: 2, completed: 10, failed: 0, skipped: 0 },
        items: [
          { mfcId: '111', status: 'pending', collectionStatus: 'owned', retryCount: 0 },
          { mfcId: '222', status: 'completed', collectionStatus: 'owned', retryCount: 0 }
        ]
      });

      const response = await request(app)
        .get('/sync/active-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasActiveJob).toBe(true);
      expect(response.body.job).toBeDefined();
      expect(response.body.job.sessionId).toBe(sessionId);
      expect(response.body.job.phase).toBe('enriching');
      expect(response.body.job.stats).toMatchObject({
        pending: 5,
        processing: 2,
        completed: 10,
        failed: 0,
        skipped: 0
      });
    });

    it('should return no active job when user has no jobs', async () => {
      const response = await request(app)
        .get('/sync/active-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasActiveJob).toBe(false);
      expect(response.body.job).toBeUndefined();
    });

    it('should return no active job when job is completed', async () => {
      // Create a completed SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: 'completed-session',
        phase: 'completed',
        completedAt: new Date(),
        items: []
      });

      const response = await request(app)
        .get('/sync/active-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasActiveJob).toBe(false);
    });

    it('should return no active job when job is cancelled', async () => {
      // Create a cancelled SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: 'cancelled-session',
        phase: 'cancelled',
        items: []
      });

      const response = await request(app)
        .get('/sync/active-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasActiveJob).toBe(false);
    });

    it('should return the most recent active job when multiple exist', async () => {
      // Create an older active job
      const olderJob = await SyncJob.create({
        userId: testUserId,
        sessionId: 'older-session',
        phase: 'enriching',
        startedAt: new Date(Date.now() - 60000),
        items: []
      });

      // Create a newer active job
      const newerJob = await SyncJob.create({
        userId: testUserId,
        sessionId: 'newer-session',
        phase: 'queueing',
        startedAt: new Date(),
        items: []
      });

      const response = await request(app)
        .get('/sync/active-job')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.hasActiveJob).toBe(true);
      expect(response.body.job.sessionId).toBe('newer-session');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .get('/sync/active-job')
        .expect(401);

      expect(response.body.message).toMatch(/not authorized|no token/i);
    });
  });
});
