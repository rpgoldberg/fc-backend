/**
 * Integration tests for Sync Routes Proxy Endpoints
 *
 * Tests the proxy endpoints that forward requests to the scraper service:
 * - POST /sync/validate-cookies
 * - POST /sync/parse-csv
 * - POST /sync/from-csv
 * - POST /sync/full
 * - GET /sync/status
 * - GET /sync/queue-stats
 * - GET /sync/mfc/cookie-allowlist
 */
import request from 'supertest';
import express from 'express';
import mongoose from 'mongoose';
import cors from 'cors';
import syncRoutes from '../../src/routes/syncRoutes';
import { User } from '../../src/models';
import { generateTestToken } from '../setup';

// Mock global fetch for proxy tests
const mockFetch = jest.fn();
global.fetch = mockFetch;

// Test user ID - must be valid 24-char hex string
const TEST_USER_ID = '507f1f77bcf86cd799439020';

// Create test app with sync routes
const createSyncTestApp = () => {
  const app = express();
  app.use(cors());
  app.use(express.json());
  app.use('/sync', syncRoutes);
  return app;
};

const app = createSyncTestApp();

describe('Sync Routes - Proxy Endpoints', () => {
  let authToken: string;
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(async () => {
    testUserId = new mongoose.Types.ObjectId(TEST_USER_ID);
    authToken = generateTestToken(TEST_USER_ID);
    jest.clearAllMocks();

    // Create test user in database (auth middleware validates user exists)
    await User.create({
      _id: testUserId,
      username: 'proxytest',
      email: 'proxytest@example.com',
      password: 'hashedpassword123'
    });

    // Default mock for successful scraper response
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ success: true, data: {} })
    });
  });

  afterEach(async () => {
    await User.deleteMany({});
  });

  describe('POST /sync/validate-cookies', () => {
    it('should proxy validate-cookies request to scraper', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ success: true, valid: true })
      });

      const response = await request(app)
        .post('/sync/validate-cookies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cookies: 'session_id=abc123' })
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sync/validate-cookies'),
        expect.objectContaining({
          method: 'POST',
          headers: expect.objectContaining({
            'Content-Type': 'application/json'
          })
        })
      );
    });

    it('should return 400 when cookies are missing', async () => {
      const response = await request(app)
        .post('/sync/validate-cookies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('MFC cookies are required');
    });

    it('should handle scraper service error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 503,
        json: async () => ({ message: 'Service unavailable' })
      });

      const response = await request(app)
        .post('/sync/validate-cookies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cookies: 'session_id=abc123' })
        .expect(503);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Service unavailable');
    });

    it('should handle network error from scraper', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));

      const response = await request(app)
        .post('/sync/validate-cookies')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cookies: 'session_id=abc123' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Connection refused');
    });

    it('should require authentication', async () => {
      const response = await request(app)
        .post('/sync/validate-cookies')
        .send({ cookies: 'session_id=abc123' })
        .expect(401);

      expect(response.body.message).toMatch(/not authorized|no token/i);
    });
  });

  describe('POST /sync/parse-csv', () => {
    it('should proxy parse-csv request to scraper', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { items: [{ mfcId: '12345', name: 'Test Figure' }] }
        })
      });

      const response = await request(app)
        .post('/sync/parse-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent: 'id,name\n12345,Test Figure' })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 when csvContent is missing', async () => {
      const response = await request(app)
        .post('/sync/parse-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({})
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('CSV content is required');
    });

    it('should handle scraper service error for parse-csv', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({ message: 'Invalid CSV format' })
      });

      const response = await request(app)
        .post('/sync/parse-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent: 'bad csv data' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Invalid CSV format');
    });

    it('should handle network error for parse-csv', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const response = await request(app)
        .post('/sync/parse-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent: 'id,name\n12345,Test Figure' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /sync/from-csv', () => {
    it('should proxy from-csv request to scraper', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { queued: 5, sessionId: 'test-session' }
        })
      });

      const response = await request(app)
        .post('/sync/from-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          csvContent: 'id,name\n12345,Test Figure',
          cookies: 'session_id=abc',
          sessionId: 'test-session'
        })
        .expect(200);

      expect(response.body.success).toBe(true);
    });

    it('should return 400 when csvContent is missing for from-csv', async () => {
      const response = await request(app)
        .post('/sync/from-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cookies: 'session_id=abc' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('CSV content is required');
    });

    it('should handle scraper error for from-csv', async () => {
      mockFetch.mockRejectedValue(new Error('Scraper timeout'));

      const response = await request(app)
        .post('/sync/from-csv')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ csvContent: 'data', sessionId: 's1' })
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('POST /sync/full', () => {
    it('should proxy full sync request to scraper with webhook config', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { sessionId: 'full-sync-123', queued: 100 }
        })
      });

      const response = await request(app)
        .post('/sync/full')
        .set('Authorization', `Bearer ${authToken}`)
        .send({
          cookies: 'session_id=abc123',
          sessionId: 'full-sync-123',
          includeLists: ['owned', 'ordered'],
          skipCached: true,
          statusFilter: 'owned'
        })
        .expect(200);

      expect(response.body.success).toBe(true);

      // Verify proxy call includes webhookUrl and webhookSecret
      const fetchCallBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchCallBody.cookies).toBe('session_id=abc123');
      expect(fetchCallBody.sessionId).toBe('full-sync-123');
      expect(fetchCallBody.webhookUrl).toContain('/sync/webhook');
      expect(fetchCallBody.webhookSecret).toBeDefined();
      expect(fetchCallBody.includeLists).toEqual(['owned', 'ordered']);
      expect(fetchCallBody.skipCached).toBe(true);
      expect(fetchCallBody.statusFilter).toBe('owned');
    });

    it('should return 400 when cookies are missing for full sync', async () => {
      const response = await request(app)
        .post('/sync/full')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ sessionId: 'test-session' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('MFC cookies are required for full sync');
    });

    it('should return 400 when sessionId is missing for full sync', async () => {
      const response = await request(app)
        .post('/sync/full')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cookies: 'session_id=abc123' })
        .expect(400);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('sessionId is required for full sync');
    });

    it('should handle scraper error for full sync', async () => {
      mockFetch.mockRejectedValue(new Error('Sync failed'));

      const response = await request(app)
        .post('/sync/full')
        .set('Authorization', `Bearer ${authToken}`)
        .send({ cookies: 'session_id=abc', sessionId: 's1' })
        .expect(500);

      expect(response.body.success).toBe(false);
      expect(response.body.message).toBe('Sync failed');
    });
  });

  describe('GET /sync/status', () => {
    it('should proxy status request to scraper', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { status: 'idle', activeSessions: 0 }
        })
      });

      const response = await request(app)
        .get('/sync/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining(`/sync/status?userId=${TEST_USER_ID}`),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle scraper error for status', async () => {
      mockFetch.mockRejectedValue(new Error('Status check failed'));

      const response = await request(app)
        .get('/sync/status')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /sync/queue-stats', () => {
    it('should proxy queue-stats request to scraper', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { pending: 10, processing: 2, completed: 50 }
        })
      });

      const response = await request(app)
        .get('/sync/queue-stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/sync/queue-stats'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle scraper error for queue-stats', async () => {
      mockFetch.mockRejectedValue(new Error('Queue stats failed'));

      const response = await request(app)
        .get('/sync/queue-stats')
        .set('Authorization', `Bearer ${authToken}`)
        .expect(500);

      expect(response.body.success).toBe(false);
    });
  });

  describe('GET /sync/mfc/cookie-allowlist', () => {
    it('should proxy cookie-allowlist request to scraper (no auth required)', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: ['session_id', 'cf_clearance']
        })
      });

      const response = await request(app)
        .get('/sync/mfc/cookie-allowlist')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/mfc/cookie-allowlist'),
        expect.objectContaining({ method: 'GET' })
      );
    });

    it('should handle scraper error for cookie-allowlist', async () => {
      mockFetch.mockRejectedValue(new Error('Allowlist fetch failed'));

      const response = await request(app)
        .get('/sync/mfc/cookie-allowlist')
        .expect(500);

      expect(response.body.success).toBe(false);
    });

    it('should handle scraper returning non-ok status for cookie-allowlist', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        status: 502,
        json: async () => ({ message: 'Bad gateway' })
      });

      const response = await request(app)
        .get('/sync/mfc/cookie-allowlist')
        .expect(502);

      expect(response.body.success).toBe(false);
    });
  });
});
