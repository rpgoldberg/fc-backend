/**
 * Integration tests for Sync Routes Cancel Functionality
 *
 * Tests that DELETE /sync/job/:sessionId notifies the scraper service
 * to cancel all pending items for the session.
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
const TEST_USER_ID = '507f1f77bcf86cd799439011';

// Create test app with sync routes
const createSyncTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/sync', syncRoutes);
  return app;
};

const app = createSyncTestApp();

describe('Sync Routes - Cancel Job with Scraper Notification', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testSessionId: string;
  let authToken: string;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId(TEST_USER_ID);
    testSessionId = 'test-session-' + Math.random().toString(36).substring(7);
    authToken = generateTestToken(TEST_USER_ID);
    jest.clearAllMocks();

    // Zero trust: Create test user in database (auth middleware validates user exists)
    await User.create({
      _id: testUserId,
      username: 'canceltest',
      email: 'canceltest@example.com',
      password: 'hashedpassword123'
    });

    // Default mock for successful scraper response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: { cancelledCount: 5 } })
    });
  });

  afterEach(async () => {
    await SyncJob.deleteMany({});
    await User.deleteMany({});
  });

  describe('DELETE /sync/job/:sessionId', () => {
    it('should notify scraper to cancel session when job is cancelled', async () => {
      // Create an active SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [
          { mfcId: '111', status: 'pending', collectionStatus: 'owned', retryCount: 0 },
          { mfcId: '222', status: 'pending', collectionStatus: 'owned', retryCount: 0 }
        ]
      });

      const response = await request(app)
        .delete(`/sync/job/${testSessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.message).toBe('Sync cancelled');

      // Verify fetch was called to notify scraper
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/sync/sessions/${testSessionId}`),
        expect.objectContaining({
          method: 'DELETE'
        })
      );
    });

    it('should still cancel job even if scraper notification fails', async () => {
      // Create an active SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'enriching',
        items: [{ mfcId: '123', status: 'pending', collectionStatus: 'owned', retryCount: 0 }]
      });

      // Mock scraper as unavailable
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const response = await request(app)
        .delete(`/sync/job/${testSessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify job was still cancelled
      const job = await SyncJob.findOne({ sessionId: testSessionId });
      expect(job?.phase).toBe('cancelled');
    });

    it('should return 404 when job does not exist', async () => {
      const response = await request(app)
        .delete('/sync/job/nonexistent-session')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(404);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('SyncJob not found');
    });

    it('should return 400 when trying to cancel a completed job', async () => {
      // Create a completed SyncJob
      await SyncJob.create({
        userId: testUserId,
        sessionId: testSessionId,
        phase: 'completed',
        completedAt: new Date(),
        items: []
      });

      const response = await request(app)
        .delete(`/sync/job/${testSessionId}`)
        .set('Authorization', `Bearer ${authToken}`)
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Cannot cancel a completed job');
    });
  });
});
