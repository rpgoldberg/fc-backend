/**
 * Tests for gRPC integration in sync routes.
 *
 * Verifies that when USE_GRPC=true, sync endpoints call the gRPC client
 * instead of proxyToScraper, and when USE_GRPC=false, existing REST
 * proxy behavior is unchanged.
 */

// ---------------------------------------------------------------------------
// Mock modules before any imports (jest.mock is hoisted)
// ---------------------------------------------------------------------------

// Mock @grpc/grpc-js to prevent native module loading
jest.mock('@grpc/grpc-js', () => ({
  credentials: { createInsecure: jest.fn().mockReturnValue('insecure') },
  Metadata: jest.fn().mockImplementation(() => ({ set: jest.fn() })),
}));

// Mock generated protobuf service
jest.mock('../../../src/grpc/generated/figure_collector/v1/scraper_service', () => ({
  ScraperServiceClient: jest.fn().mockImplementation(() => ({})),
}));

const mockScraperClient = {
  validateCookies: jest.fn(),
  parseCsv: jest.fn(),
  getQueueStats: jest.fn(),
  getSyncStatus: jest.fn(),
  getCookieAllowlist: jest.fn(),
  resumeSession: jest.fn(),
  cancelFailedItems: jest.fn(),
  cancelSession: jest.fn(),
  executeFullSync: jest.fn(),
  syncFromCsv: jest.fn(),
};

let grpcEnabled = false;

jest.mock('../../../src/grpc/index', () => ({
  isGrpcEnabled: () => grpcEnabled,
  getScraperClient: () => mockScraperClient,
}));

// Also mock the barrel import that syncRoutes uses
jest.mock('../../../src/grpc', () => ({
  isGrpcEnabled: () => grpcEnabled,
  getScraperClient: () => mockScraperClient,
}));

// Mock the models
const mockSyncJobFindOne = jest.fn();
const mockSyncJobFind = jest.fn();
const mockSyncJobCreate = jest.fn();
const mockSyncJobDeleteOne = jest.fn();
const mockFigureFindOneAndUpdate = jest.fn();
const mockMfcListFindOneAndUpdate = jest.fn();
const mockMFCItemFindOneAndUpdate = jest.fn().mockReturnValue({ catch: jest.fn() });

jest.mock('../../../src/models', () => ({
  SyncJob: {
    findOne: (...args: any[]) => mockSyncJobFindOne(...args),
    find: (...args: any[]) => mockSyncJobFind(...args),
    create: (...args: any[]) => mockSyncJobCreate(...args),
    deleteOne: (...args: any[]) => mockSyncJobDeleteOne(...args),
  },
  ISyncJob: {},
  SyncItemStatus: {},
  Figure: {
    findOneAndUpdate: (...args: any[]) => mockFigureFindOneAndUpdate(...args),
  },
  Company: { findOneAndUpdate: jest.fn(), findOne: jest.fn() },
  Artist: { findOneAndUpdate: jest.fn() },
  RoleType: { findOne: jest.fn() },
  MfcList: {
    findOneAndUpdate: (...args: any[]) => mockMfcListFindOneAndUpdate(...args),
  },
  MFCItem: {
    findOneAndUpdate: (...args: any[]) => mockMFCItemFindOneAndUpdate(...args),
  },
}));

// Mock auth middleware
jest.mock('../../../src/middleware/authMiddleware', () => ({
  protect: (req: any, _res: any, next: any) => {
    req.user = { id: 'test-user-id' };
    next();
  },
}));

// Mock logger
jest.mock('../../../src/utils/logger', () => ({
  syncLogger: {
    webhookReceived: jest.fn(),
    itemSaved: jest.fn(),
    itemFailed: jest.fn(),
    phaseChange: jest.fn(),
    jobComplete: jest.fn(),
  },
  createLogger: () => ({
    info: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    debug: jest.fn(),
  }),
}));

// Mock search index service
jest.mock('../../../src/services/searchIndexService', () => ({
  upsertFigureSearchIndex: jest.fn().mockReturnValue(Promise.resolve()),
}));

// Mock parseDimensions
jest.mock('../../../src/utils/parseDimensions', () => ({
  parseDimensionsString: jest.fn(),
}));

// Mock global fetch for REST proxy
const mockFetch = jest.fn();
(global as any).fetch = mockFetch;

// Now import modules under test
import express from 'express';
import request from 'supertest';
import syncRoutes, {
  processGrpcSyncStream,
  handleItemCompleteEvent,
  handlePhaseChangeEvent,
  handleListsSyncEvent,
  broadcastToSession,
} from '../../../src/routes/syncRoutes';

function createApp() {
  const app = express();
  app.use(express.json());
  app.use('/sync', syncRoutes);
  return app;
}

describe('Sync Routes - gRPC Integration', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    grpcEnabled = false;
    mockFetch.mockReset();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // POST /sync/validate-cookies
  // =========================================================================
  describe('POST /sync/validate-cookies', () => {
    it('uses gRPC client when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.validateCookies.mockResolvedValue({
        valid: true,
        reason: '',
        shouldNotify: false,
      });

      const app = createApp();
      const res = await request(app)
        .post('/sync/validate-cookies')
        .send({ cookies: { session_id: 'abc123' } });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.valid).toBe(true);
      expect(mockScraperClient.validateCookies).toHaveBeenCalledWith(
        expect.objectContaining({
          cookies: { session_id: 'abc123' },
        })
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses REST proxy when USE_GRPC=false', async () => {
      grpcEnabled = false;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, valid: true }),
      });

      const app = createApp();
      const res = await request(app)
        .post('/sync/validate-cookies')
        .send({ cookies: { session_id: 'abc123' } });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
      expect(mockScraperClient.validateCookies).not.toHaveBeenCalled();
    });

    it('maps gRPC errors to HTTP responses', async () => {
      grpcEnabled = true;
      const grpcError = new Error('Service unavailable') as any;
      grpcError.statusCode = 503;
      grpcError.grpcCode = 14;
      mockScraperClient.validateCookies.mockRejectedValue(grpcError);

      const app = createApp();
      const res = await request(app)
        .post('/sync/validate-cookies')
        .send({ cookies: { session_id: 'abc123' } });

      expect(res.status).toBe(503);
      expect(res.body.success).toBe(false);
      expect(res.body.message).toBe('Service unavailable');
    });

    it('returns 400 when cookies are missing', async () => {
      grpcEnabled = true;
      const app = createApp();
      const res = await request(app)
        .post('/sync/validate-cookies')
        .send({});

      expect(res.status).toBe(400);
      expect(res.body.message).toBe('MFC cookies are required');
      expect(mockScraperClient.validateCookies).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POST /sync/parse-csv
  // =========================================================================
  describe('POST /sync/parse-csv', () => {
    it('uses gRPC client when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.parseCsv.mockResolvedValue({
        success: true,
        items: [{ mfcId: '12345', name: 'Test Figure', collectionStatus: 'owned' }],
        totalParsed: 1,
        errorMessage: '',
      });

      const app = createApp();
      const res = await request(app)
        .post('/sync/parse-csv')
        .send({ csvContent: 'id,name\n12345,Test Figure' });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.items).toHaveLength(1);
      expect(mockScraperClient.parseCsv).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses REST proxy when USE_GRPC=false', async () => {
      grpcEnabled = false;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, items: [], totalParsed: 0 }),
      });

      const app = createApp();
      const res = await request(app)
        .post('/sync/parse-csv')
        .send({ csvContent: 'id,name\n12345,Test' });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
      expect(mockScraperClient.parseCsv).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GET /sync/status
  // =========================================================================
  describe('GET /sync/status', () => {
    it('uses gRPC client when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.getSyncStatus.mockResolvedValue({
        sessionId: 'sess-1',
        phase: 'enriching',
        message: 'Processing items',
      });

      const app = createApp();
      const res = await request(app).get('/sync/status');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.sessionId).toBe('sess-1');
      expect(mockScraperClient.getSyncStatus).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses REST proxy when USE_GRPC=false', async () => {
      grpcEnabled = false;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, phase: 'idle' }),
      });

      const app = createApp();
      const res = await request(app).get('/sync/status');

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GET /sync/queue-stats
  // =========================================================================
  describe('GET /sync/queue-stats', () => {
    it('uses gRPC client when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.getQueueStats.mockResolvedValue({
        queued: 10,
        completed: 5,
        failed: 1,
      });

      const app = createApp();
      const res = await request(app).get('/sync/queue-stats');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.queued).toBe(10);
      expect(mockScraperClient.getQueueStats).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // GET /sync/mfc/cookie-allowlist
  // =========================================================================
  describe('GET /sync/mfc/cookie-allowlist', () => {
    it('uses gRPC client when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.getCookieAllowlist.mockResolvedValue({
        allowedCookieNames: ['session_id', 'session_token'],
      });

      const app = createApp();
      const res = await request(app).get('/sync/mfc/cookie-allowlist');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.allowedCookieNames).toEqual(['session_id', 'session_token']);
      expect(mockScraperClient.getCookieAllowlist).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses REST proxy when USE_GRPC=false', async () => {
      grpcEnabled = false;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, allowedCookieNames: ['session_id'] }),
      });

      const app = createApp();
      const res = await request(app).get('/sync/mfc/cookie-allowlist');

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // POST /sync/full (streaming)
  // =========================================================================
  describe('POST /sync/full', () => {
    it('uses gRPC streaming when USE_GRPC=true', async () => {
      grpcEnabled = true;

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {},
        cancel: jest.fn(),
      };
      mockScraperClient.executeFullSync.mockReturnValue(mockStream);

      const app = createApp();
      const res = await request(app)
        .post('/sync/full')
        .send({
          cookies: { session_id: 'abc123' },
          sessionId: 'sess-1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Sync started via gRPC');
      expect(mockScraperClient.executeFullSync).toHaveBeenCalledWith(
        expect.objectContaining({
          sessionId: 'sess-1',
          cookies: { session_id: 'abc123' },
        })
      );
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('uses REST proxy when USE_GRPC=false', async () => {
      grpcEnabled = false;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true, sessionId: 'sess-1' }),
      });

      const app = createApp();
      const res = await request(app)
        .post('/sync/full')
        .send({
          cookies: { session_id: 'abc123' },
          sessionId: 'sess-1',
        });

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
      expect(mockScraperClient.executeFullSync).not.toHaveBeenCalled();
    });

    it('returns 400 when cookies are missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sync/full')
        .send({ sessionId: 'sess-1' });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('cookies are required');
    });

    it('returns 400 when sessionId is missing', async () => {
      const app = createApp();
      const res = await request(app)
        .post('/sync/full')
        .send({ cookies: { session_id: 'abc' } });

      expect(res.status).toBe(400);
      expect(res.body.message).toContain('sessionId is required');
    });
  });

  // =========================================================================
  // POST /sync/from-csv (streaming)
  // =========================================================================
  describe('POST /sync/from-csv', () => {
    it('uses gRPC streaming when USE_GRPC=true', async () => {
      grpcEnabled = true;

      mockScraperClient.parseCsv.mockResolvedValue({
        success: true,
        items: [{ mfcId: '12345', name: 'Test', collectionStatus: 'owned' }],
        totalParsed: 1,
        errorMessage: '',
      });

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {},
        cancel: jest.fn(),
      };
      mockScraperClient.syncFromCsv.mockReturnValue(mockStream);

      const app = createApp();
      const res = await request(app)
        .post('/sync/from-csv')
        .send({
          csvContent: 'id,name\n12345,Test',
          cookies: { session_id: 'abc' },
          sessionId: 'sess-csv-1',
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain('gRPC');
      expect(mockScraperClient.syncFromCsv).toHaveBeenCalled();
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Session Management Endpoints
  // =========================================================================
  describe('POST /sync/sessions/:id/resume', () => {
    it('calls gRPC resumeSession when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.resumeSession.mockResolvedValue({
        success: true,
        message: 'Session resumed',
      });

      const app = createApp();
      const res = await request(app).post('/sync/sessions/sess-1/resume');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toBe('Session resumed');
      expect(mockScraperClient.resumeSession).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    });

    it('returns 501 when USE_GRPC=false', async () => {
      grpcEnabled = false;
      const app = createApp();
      const res = await request(app).post('/sync/sessions/sess-1/resume');

      expect(res.status).toBe(501);
      expect(res.body.success).toBe(false);
    });
  });

  describe('POST /sync/sessions/:id/cancel-failed', () => {
    it('calls gRPC cancelFailedItems when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.cancelFailedItems.mockResolvedValue({
        success: true,
        cancelledCount: 3,
        message: '3 items cancelled',
      });

      const app = createApp();
      const res = await request(app).post('/sync/sessions/sess-1/cancel-failed');

      expect(res.status).toBe(200);
      expect(res.body.cancelledCount).toBe(3);
      expect(mockScraperClient.cancelFailedItems).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    });

    it('returns 501 when USE_GRPC=false', async () => {
      grpcEnabled = false;
      const app = createApp();
      const res = await request(app).post('/sync/sessions/sess-1/cancel-failed');

      expect(res.status).toBe(501);
    });
  });

  describe('DELETE /sync/sessions/:id', () => {
    it('calls gRPC cancelSession when USE_GRPC=true', async () => {
      grpcEnabled = true;
      mockScraperClient.cancelSession.mockResolvedValue({
        success: true,
        cancelledCount: 5,
        message: 'Session cancelled',
      });

      const app = createApp();
      const res = await request(app).delete('/sync/sessions/sess-1');

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.cancelledCount).toBe(5);
      expect(mockScraperClient.cancelSession).toHaveBeenCalledWith({ sessionId: 'sess-1' });
    });

    it('uses REST proxy when USE_GRPC=false', async () => {
      grpcEnabled = false;
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ success: true }),
      });

      const app = createApp();
      const res = await request(app).delete('/sync/sessions/sess-1');

      expect(res.status).toBe(200);
      expect(mockFetch).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // processGrpcSyncStream (background event processing)
  // =========================================================================
  describe('processGrpcSyncStream', () => {
    it('handles phaseChange events', async () => {
      const mockJob = {
        phase: 'enriching',
        message: '',
        items: [],
        stats: { total: 0, completed: 0, failed: 0 },
        save: jest.fn().mockResolvedValue(true),
        recalculateStats: jest.fn(),
      };
      mockSyncJobFindOne.mockResolvedValue(mockJob);

      const events = [
        {
          sessionId: 'sess-1',
          event: {
            $case: 'phaseChange' as const,
            phaseChange: {
              phase: 'enriching',
              message: 'Processing items...',
              items: [],
            },
          },
        },
      ];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const e of events) yield e;
        },
        cancel: jest.fn(),
      };

      await processGrpcSyncStream(mockStream as any, 'sess-1');

      expect(mockSyncJobFindOne).toHaveBeenCalledWith({ sessionId: 'sess-1' });
      expect(mockJob.save).toHaveBeenCalled();
    });

    it('handles itemComplete events', async () => {
      const mockJob = {
        userId: 'test-user',
        phase: 'enriching',
        items: [{ mfcId: '12345', collectionStatus: 'owned', isOrphan: false }],
        stats: { total: 1, completed: 0, failed: 0 },
        save: jest.fn().mockResolvedValue(true),
        updateItemStatus: jest.fn().mockResolvedValue(true),
      };
      mockSyncJobFindOne.mockResolvedValue(mockJob);
      mockFigureFindOneAndUpdate.mockResolvedValue({ _id: 'fig-1' });

      const events = [
        {
          sessionId: 'sess-1',
          event: {
            $case: 'itemComplete' as const,
            itemComplete: {
              mfcId: '12345',
              data: { name: 'Test Figure' },
            },
          },
        },
      ];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const e of events) yield e;
        },
        cancel: jest.fn(),
      };

      await processGrpcSyncStream(mockStream as any, 'sess-1');

      expect(mockJob.updateItemStatus).toHaveBeenCalledWith('12345', 'completed', undefined);
    });

    it('handles itemFailed events', async () => {
      const mockJob = {
        userId: 'test-user',
        phase: 'enriching',
        items: [{ mfcId: '99999', collectionStatus: 'owned', isOrphan: false }],
        stats: { total: 1, completed: 0, failed: 0 },
        save: jest.fn().mockResolvedValue(true),
        updateItemStatus: jest.fn().mockResolvedValue(true),
      };
      mockSyncJobFindOne.mockResolvedValue(mockJob);

      const events = [
        {
          sessionId: 'sess-1',
          event: {
            $case: 'itemFailed' as const,
            itemFailed: {
              mfcId: '99999',
              error: 'Page not found',
              retryable: false,
            },
          },
        },
      ];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const e of events) yield e;
        },
        cancel: jest.fn(),
      };

      await processGrpcSyncStream(mockStream as any, 'sess-1');

      expect(mockJob.updateItemStatus).toHaveBeenCalledWith('99999', 'failed', 'Page not found');
    });

    it('handles stream errors gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          throw new Error('Connection lost');
        },
        cancel: jest.fn(),
      };

      await processGrpcSyncStream(mockStream as any, 'sess-err');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Stream error'),
        'Connection lost'
      );
      consoleSpy.mockRestore();
    });

    it('handles listsSync events', async () => {
      const mockJob = {
        userId: 'test-user',
        phase: 'enriching',
        save: jest.fn().mockResolvedValue(true),
      };
      mockSyncJobFindOne.mockResolvedValue(mockJob);
      mockMfcListFindOneAndUpdate.mockResolvedValue({});

      const events = [
        {
          sessionId: 'sess-1',
          event: {
            $case: 'listsSync' as const,
            listsSync: {
              lists: [
                {
                  mfcId: 100,
                  name: 'My Wishlist',
                  teaser: '',
                  description: '',
                  privacy: 'public',
                  iconUrl: '',
                  itemCount: 5,
                  itemMfcIds: [1, 2, 3, 4, 5],
                  itemDetails: [],
                  mfcCreatedAt: '',
                },
              ],
            },
          },
        },
      ];

      const mockStream = {
        [Symbol.asyncIterator]: async function* () {
          for (const e of events) yield e;
        },
        cancel: jest.fn(),
      };

      await processGrpcSyncStream(mockStream as any, 'sess-1');

      expect(mockMfcListFindOneAndUpdate).toHaveBeenCalled();
    });
  });

  // =========================================================================
  // Shared Event Handlers
  // =========================================================================
  describe('handleItemCompleteEvent', () => {
    it('does nothing when SyncJob is not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSyncJobFindOne.mockResolvedValue(null);

      await handleItemCompleteEvent('nonexistent', '12345', 'completed' as any, undefined, { name: 'Test' });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('SyncJob not found')
      );
      consoleSpy.mockRestore();
    });
  });

  describe('handlePhaseChangeEvent', () => {
    it('ignores terminal phases when items exist', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();
      const mockJob = {
        phase: 'enriching',
        items: [{ mfcId: '12345' }],
        stats: {},
        save: jest.fn(),
      };
      mockSyncJobFindOne.mockResolvedValue(mockJob);

      await handlePhaseChangeEvent('sess-1', 'completed', 'Done');

      expect(mockJob.save).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Ignoring terminal phase')
      );
      consoleSpy.mockRestore();
    });

    it('accepts completed phase when there are no items', async () => {
      const mockJob = {
        phase: 'enriching',
        items: [],
        stats: { total: 0, completed: 0, failed: 0 },
        message: '',
        save: jest.fn().mockResolvedValue(true),
      };
      mockSyncJobFindOne.mockResolvedValue(mockJob);

      await handlePhaseChangeEvent('sess-1', 'completed', 'No items to sync');

      expect(mockJob.phase).toBe('completed');
      expect(mockJob.save).toHaveBeenCalled();
    });
  });

  describe('handleListsSyncEvent', () => {
    it('returns 0 when SyncJob is not found', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      mockSyncJobFindOne.mockResolvedValue(null);

      const count = await handleListsSyncEvent('nonexistent', []);

      expect(count).toBe(0);
      consoleSpy.mockRestore();
    });
  });
});
