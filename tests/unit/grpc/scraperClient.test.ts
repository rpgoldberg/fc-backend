import { EventEmitter } from 'events';

// ---------------------------------------------------------------------------
// Mock @grpc/grpc-js before any imports that touch it
// ---------------------------------------------------------------------------
const mockMetadata = {
  set: jest.fn(),
};

jest.mock('@grpc/grpc-js', () => ({
  credentials: {
    createInsecure: jest.fn().mockReturnValue('insecure-creds'),
  },
  Metadata: jest.fn().mockImplementation(() => mockMetadata),
}));

// Mock the generated ScraperServiceClient constructor
const mockClientInstance: Record<string, jest.Mock> = {
  close: jest.fn(),
  validateCookies: jest.fn(),
  parseCsv: jest.fn(),
  scrapeGeneric: jest.fn(),
  getQueueStats: jest.fn(),
  getSyncStatus: jest.fn(),
  getCookieAllowlist: jest.fn(),
  resumeSession: jest.fn(),
  cancelFailedItems: jest.fn(),
  cancelSession: jest.fn(),
  executeFullSync: jest.fn(),
  syncFromCsv: jest.fn(),
};

jest.mock('../../../src/grpc/generated/figure_collector/v1/scraper_service', () => ({
  ScraperServiceClient: jest.fn().mockImplementation(() => mockClientInstance),
}));

// Now import the modules under test
import { getScraperGrpcClient, createAuthMetadata, closeScraperGrpcClient } from '../../../src/grpc/client';
import { ScraperGrpcClient, getScraperClient } from '../../../src/grpc/scraperClient';
import { isGrpcEnabled } from '../../../src/grpc/index';

describe('gRPC Client', () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset the singleton by closing any existing client
    closeScraperGrpcClient();
    mockMetadata.set.mockClear();
  });

  afterEach(() => {
    process.env = { ...originalEnv };
  });

  // =========================================================================
  // client.ts — low-level singleton
  // =========================================================================

  describe('getScraperGrpcClient', () => {
    it('creates client with default address when SCRAPER_GRPC_URL is not set', () => {
      delete process.env.SCRAPER_GRPC_URL;
      // The module reads env at import time, so we test the default path
      const client = getScraperGrpcClient();
      expect(client).toBeDefined();
      expect(client.validateCookies).toBeDefined();
    });

    it('returns the same singleton on repeated calls', () => {
      const first = getScraperGrpcClient();
      const second = getScraperGrpcClient();
      expect(first).toBe(second);
    });

    it('creates a new client after closeScraperGrpcClient', () => {
      const first = getScraperGrpcClient();
      const closeBefore = mockClientInstance.close.mock.calls.length;
      closeScraperGrpcClient();
      expect(mockClientInstance.close).toHaveBeenCalledTimes(closeBefore + 1);

      const second = getScraperGrpcClient();
      // Both resolve to the same mock instance object, but close was called between
      expect(second).toBeDefined();
    });
  });

  describe('closeScraperGrpcClient', () => {
    it('calls client.close() when a client exists', () => {
      getScraperGrpcClient(); // ensure client is created
      const closeBefore = mockClientInstance.close.mock.calls.length;
      closeScraperGrpcClient();
      expect(mockClientInstance.close).toHaveBeenCalledTimes(closeBefore + 1);
    });

    it('is a no-op when no client exists', () => {
      // Close without ever creating — should not throw
      closeScraperGrpcClient();
      closeScraperGrpcClient();
      expect(mockClientInstance.close).not.toHaveBeenCalled();
    });
  });

  describe('createAuthMetadata', () => {
    it('attaches Bearer token when SCRAPER_AUTH_TOKEN is set', () => {
      process.env.SCRAPER_AUTH_TOKEN = 'test-token-123';
      const metadata = createAuthMetadata();
      expect(mockMetadata.set).toHaveBeenCalledWith('authorization', 'Bearer test-token-123');
      expect(metadata).toBe(mockMetadata);
    });

    it('attaches Bearer token from SERVICE_AUTH_TOKEN fallback', () => {
      delete process.env.SCRAPER_AUTH_TOKEN;
      process.env.SERVICE_AUTH_TOKEN = 'service-fallback-token';

      const metadata = createAuthMetadata();
      expect(mockMetadata.set).toHaveBeenCalledWith('authorization', 'Bearer service-fallback-token');
      expect(metadata).toBeDefined();
    });

    it('does not attach authorization header when no token is configured', () => {
      delete process.env.SCRAPER_AUTH_TOKEN;
      delete process.env.SERVICE_AUTH_TOKEN;

      const metadata = createAuthMetadata();
      expect(mockMetadata.set).not.toHaveBeenCalled();
      expect(metadata).toBeDefined();
    });
  });

  // =========================================================================
  // scraperClient.ts — typed wrapper
  // =========================================================================

  describe('ScraperGrpcClient', () => {
    let scraperClient: ScraperGrpcClient;

    beforeEach(() => {
      scraperClient = new ScraperGrpcClient();
      // Ensure the underlying gRPC client is created
      getScraperGrpcClient();
    });

    describe('unary RPCs', () => {
      const unaryMethods = [
        { method: 'validateCookies', grpcMethod: 'validateCookies', request: { cookies: { sess: 'abc' }, sessionId: '', userId: '', forceRevalidate: false, structureOnly: false } },
        { method: 'parseCsv', grpcMethod: 'parseCsv', request: { csvContent: 'id,name\n1,Test', sessionId: '' } },
        { method: 'scrapeGeneric', grpcMethod: 'scrapeGeneric', request: { url: 'https://example.com' } },
        { method: 'getQueueStats', grpcMethod: 'getQueueStats', request: {} },
        { method: 'getSyncStatus', grpcMethod: 'getSyncStatus', request: { sessionId: 'sess-1' } },
        { method: 'getCookieAllowlist', grpcMethod: 'getCookieAllowlist', request: {} },
        { method: 'resumeSession', grpcMethod: 'resumeSession', request: { sessionId: 'sess-1' } },
        { method: 'cancelFailedItems', grpcMethod: 'cancelFailedItems', request: { sessionId: 'sess-1' } },
        { method: 'cancelSession', grpcMethod: 'cancelSession', request: { sessionId: 'sess-1' } },
      ] as const;

      it.each(unaryMethods)(
        '$method calls the correct gRPC method and resolves on success',
        async ({ method, grpcMethod, request }) => {
          const expectedResponse = { success: true };
          mockClientInstance[grpcMethod].mockImplementation(
            (_req: any, _meta: any, cb: (err: any, res: any) => void) => {
              cb(null, expectedResponse);
            },
          );

          const result = await (scraperClient as any)[method](request);
          expect(result).toEqual(expectedResponse);
          expect(mockClientInstance[grpcMethod]).toHaveBeenCalledWith(
            request,
            expect.anything(), // metadata
            expect.any(Function),
          );
        },
      );

      it.each(unaryMethods)(
        '$method rejects with mapped error on gRPC failure',
        async ({ method, grpcMethod, request }) => {
          const grpcError = { code: 14, details: 'Connection refused', message: 'Connection refused' };
          mockClientInstance[grpcMethod].mockImplementation(
            (_req: any, _meta: any, cb: (err: any, res: any) => void) => {
              cb(grpcError, null);
            },
          );

          await expect((scraperClient as any)[method](request)).rejects.toMatchObject({
            message: 'Connection refused',
            statusCode: 503, // UNAVAILABLE -> 503
            grpcCode: 14,
          });
        },
      );
    });

    describe('error mapping', () => {
      const errorCases = [
        { grpcCode: 0, httpStatus: 200, name: 'OK' },
        { grpcCode: 1, httpStatus: 499, name: 'CANCELLED' },
        { grpcCode: 2, httpStatus: 500, name: 'UNKNOWN' },
        { grpcCode: 3, httpStatus: 400, name: 'INVALID_ARGUMENT' },
        { grpcCode: 4, httpStatus: 504, name: 'DEADLINE_EXCEEDED' },
        { grpcCode: 5, httpStatus: 404, name: 'NOT_FOUND' },
        { grpcCode: 6, httpStatus: 409, name: 'ALREADY_EXISTS' },
        { grpcCode: 7, httpStatus: 403, name: 'PERMISSION_DENIED' },
        { grpcCode: 8, httpStatus: 429, name: 'RESOURCE_EXHAUSTED' },
        { grpcCode: 9, httpStatus: 400, name: 'FAILED_PRECONDITION' },
        { grpcCode: 10, httpStatus: 409, name: 'ABORTED' },
        { grpcCode: 11, httpStatus: 400, name: 'OUT_OF_RANGE' },
        { grpcCode: 12, httpStatus: 501, name: 'UNIMPLEMENTED' },
        { grpcCode: 13, httpStatus: 500, name: 'INTERNAL' },
        { grpcCode: 14, httpStatus: 503, name: 'UNAVAILABLE' },
        { grpcCode: 15, httpStatus: 500, name: 'DATA_LOSS' },
        { grpcCode: 16, httpStatus: 401, name: 'UNAUTHENTICATED' },
      ];

      it.each(errorCases)(
        'maps gRPC $name (code $grpcCode) to HTTP $httpStatus',
        ({ grpcCode, httpStatus }) => {
          const err = { code: grpcCode, details: 'test error', message: 'test error' };
          const mapped = ScraperGrpcClient.mapGrpcError(err);

          expect(mapped).toBeInstanceOf(Error);
          expect(mapped.statusCode).toBe(httpStatus);
          expect(mapped.grpcCode).toBe(grpcCode);
          expect(mapped.message).toBe('test error');
        },
      );

      it('defaults to HTTP 500 for unknown gRPC codes', () => {
        const err = { code: 99, details: 'mystery', message: 'mystery' };
        const mapped = ScraperGrpcClient.mapGrpcError(err);
        expect(mapped.statusCode).toBe(500);
        expect(mapped.grpcCode).toBe(99);
      });

      it('uses err.message when err.details is missing', () => {
        const err = { code: 13, message: 'internal error' };
        const mapped = ScraperGrpcClient.mapGrpcError(err);
        expect(mapped.message).toBe('internal error');
      });

      it('prefers err.details over err.message', () => {
        const err = { code: 3, details: 'field X required', message: 'bad request' };
        const mapped = ScraperGrpcClient.mapGrpcError(err);
        expect(mapped.message).toBe('field X required');
      });

      it('defaults grpcCode to 2 (UNKNOWN) when err.code is undefined', () => {
        const err = { message: 'no code' };
        const mapped = ScraperGrpcClient.mapGrpcError(err);
        expect(mapped.grpcCode).toBe(2);
      });
    });

    describe('server-streaming RPCs', () => {
      function createMockStream() {
        const emitter = new EventEmitter();
        (emitter as any).cancel = jest.fn();
        return emitter;
      }

      describe('executeFullSync', () => {
        it('returns an async iterable that yields streamed events', async () => {
          const mockStream = createMockStream();
          mockClientInstance.executeFullSync.mockReturnValue(mockStream);

          const request = { sessionId: 's1', userId: 'u1', cookies: {}, profileUrl: 'https://mfc.test/profile' };
          const iterable = scraperClient.executeFullSync(request);

          // Emit events asynchronously
          const events = [
            { sessionId: 's1', event: { $case: 'phaseChange', phaseChange: { phase: 'parsing', message: 'Starting', items: [] } } },
            { sessionId: 's1', event: { $case: 'summary', summary: { totalItems: 5, completed: 5, failed: 0, skipped: 0, durationMs: 1000 } } },
          ];

          setTimeout(() => {
            mockStream.emit('data', events[0]);
            mockStream.emit('data', events[1]);
            mockStream.emit('end');
          }, 10);

          const received: any[] = [];
          for await (const event of iterable) {
            received.push(event);
          }

          expect(received).toHaveLength(2);
          expect(received[0]).toEqual(events[0]);
          expect(received[1]).toEqual(events[1]);
        });

        it('supports cancellation via cancel()', () => {
          const mockStream = createMockStream();
          mockClientInstance.executeFullSync.mockReturnValue(mockStream);

          const request = { sessionId: 's1', userId: 'u1', cookies: {}, profileUrl: '' };
          const iterable = scraperClient.executeFullSync(request);

          iterable.cancel();
          expect((mockStream as any).cancel).toHaveBeenCalledTimes(1);
        });

        it('throws mapped error when stream emits error', async () => {
          const mockStream = createMockStream();
          mockClientInstance.executeFullSync.mockReturnValue(mockStream);

          const request = { sessionId: 's1', userId: 'u1', cookies: {}, profileUrl: '' };
          const iterable = scraperClient.executeFullSync(request);

          setTimeout(() => {
            mockStream.emit('error', { code: 14, details: 'unavailable', message: 'unavailable' });
          }, 10);

          await expect(async () => {
            for await (const _ of iterable) {
              // consume
            }
          }).rejects.toMatchObject({
            statusCode: 503,
            grpcCode: 14,
          });
        });
      });

      describe('syncFromCsv', () => {
        it('returns an async iterable for CSV sync events', async () => {
          const mockStream = createMockStream();
          mockClientInstance.syncFromCsv.mockReturnValue(mockStream);

          const request = { sessionId: 's2', userId: 'u2', cookies: {}, items: [] };
          const iterable = scraperClient.syncFromCsv(request);

          setTimeout(() => {
            mockStream.emit('data', { sessionId: 's2', event: { $case: 'summary', summary: { totalItems: 0, completed: 0, failed: 0, skipped: 0, durationMs: 100 } } });
            mockStream.emit('end');
          }, 10);

          const received: any[] = [];
          for await (const event of iterable) {
            received.push(event);
          }
          expect(received).toHaveLength(1);
        });

        it('supports cancellation', () => {
          const mockStream = createMockStream();
          mockClientInstance.syncFromCsv.mockReturnValue(mockStream);

          const iterable = scraperClient.syncFromCsv({ sessionId: 's2', userId: 'u2', cookies: {}, items: [] });
          iterable.cancel();
          expect((mockStream as any).cancel).toHaveBeenCalledTimes(1);
        });
      });
    });
  });

  // =========================================================================
  // scraperClient.ts — singleton
  // =========================================================================

  describe('getScraperClient', () => {
    it('returns a ScraperGrpcClient instance', () => {
      const client = getScraperClient();
      expect(client).toBeInstanceOf(ScraperGrpcClient);
    });

    it('returns the same instance on repeated calls', () => {
      const first = getScraperClient();
      const second = getScraperClient();
      expect(first).toBe(second);
    });
  });

  // =========================================================================
  // index.ts — feature flag
  // =========================================================================

  describe('isGrpcEnabled', () => {
    it('returns false when USE_GRPC is not set', () => {
      delete process.env.USE_GRPC;
      expect(isGrpcEnabled()).toBe(false);
    });

    it('returns false when USE_GRPC is "false"', () => {
      process.env.USE_GRPC = 'false';
      expect(isGrpcEnabled()).toBe(false);
    });

    it('returns true when USE_GRPC is "true"', () => {
      process.env.USE_GRPC = 'true';
      expect(isGrpcEnabled()).toBe(true);
    });

    it('returns false for other truthy-looking values', () => {
      process.env.USE_GRPC = '1';
      expect(isGrpcEnabled()).toBe(false);

      process.env.USE_GRPC = 'yes';
      expect(isGrpcEnabled()).toBe(false);
    });
  });
});
