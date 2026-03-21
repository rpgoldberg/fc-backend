import type { ClientReadableStream, ServiceError } from '@grpc/grpc-js';
import { getScraperGrpcClient, createAuthMetadata } from './client';
import type {
  ValidateCookiesRequest,
  ValidateCookiesResponse,
  ParseCsvRequest,
  ParseCsvResponse,
  ScrapeGenericRequest,
  ScrapeGenericResponse,
  GetQueueStatsRequest,
  GetQueueStatsResponse,
  GetSyncStatusRequest,
  GetSyncStatusResponse,
  GetCookieAllowlistRequest,
  GetCookieAllowlistResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
  CancelFailedItemsRequest,
  CancelFailedItemsResponse,
  CancelSessionRequest,
  CancelSessionResponse,
  FullSyncRequest,
  SyncFromCsvRequest,
  SyncEvent,
  CsvItem,
  ScrapeConfig,
} from './generated/figure_collector/v1/messages';

/** gRPC status code to HTTP status code mapping. */
const GRPC_TO_HTTP_STATUS: Record<number, number> = {
  0: 200,   // OK
  1: 499,   // CANCELLED
  2: 500,   // UNKNOWN
  3: 400,   // INVALID_ARGUMENT
  4: 504,   // DEADLINE_EXCEEDED
  5: 404,   // NOT_FOUND
  6: 409,   // ALREADY_EXISTS
  7: 403,   // PERMISSION_DENIED
  8: 429,   // RESOURCE_EXHAUSTED
  9: 400,   // FAILED_PRECONDITION
  10: 409,  // ABORTED
  11: 400,  // OUT_OF_RANGE
  12: 501,  // UNIMPLEMENTED
  13: 500,  // INTERNAL
  14: 503,  // UNAVAILABLE
  15: 500,  // DATA_LOSS
  16: 401,  // UNAUTHENTICATED
};

/** Extended Error with HTTP-compatible status code and gRPC code. */
export interface GrpcMappedError extends Error {
  statusCode: number;
  grpcCode: number;
}

/**
 * Async-iterable wrapper around a gRPC server-streaming call.
 * Supports cancellation via the cancel() method.
 */
export interface CancellableAsyncIterable<T> extends AsyncIterable<T> {
  /** Cancel the underlying gRPC stream. */
  cancel(): void;
}

/**
 * Typed async wrapper around the ScraperService gRPC client.
 *
 * Provides Promise-based interfaces for unary RPCs and async-iterable
 * interfaces for server-streaming RPCs. All methods attach the service
 * auth token via metadata automatically.
 */
export class ScraperGrpcClient {

  // ---------------------------------------------------------------------------
  // Unary RPCs
  // ---------------------------------------------------------------------------

  /** Validate MFC session cookies. */
  async validateCookies(request: ValidateCookiesRequest): Promise<ValidateCookiesResponse> {
    return this.unaryCall('validateCookies', request);
  }

  /** Parse raw CSV content into structured items. */
  async parseCsv(request: ParseCsvRequest): Promise<ParseCsvResponse> {
    return this.unaryCall('parseCsv', request);
  }

  /** Perform a generic page scrape. */
  async scrapeGeneric(request: ScrapeGenericRequest): Promise<ScrapeGenericResponse> {
    return this.unaryCall('scrapeGeneric', request);
  }

  /** Get current queue statistics. */
  async getQueueStats(request: GetQueueStatsRequest): Promise<GetQueueStatsResponse> {
    return this.unaryCall('getQueueStats', request);
  }

  /** Get sync session status. */
  async getSyncStatus(request: GetSyncStatusRequest): Promise<GetSyncStatusResponse> {
    return this.unaryCall('getSyncStatus', request);
  }

  /** Get the cookie name allowlist. */
  async getCookieAllowlist(request: GetCookieAllowlistRequest): Promise<GetCookieAllowlistResponse> {
    return this.unaryCall('getCookieAllowlist', request);
  }

  /** Resume a paused sync session. */
  async resumeSession(request: ResumeSessionRequest): Promise<ResumeSessionResponse> {
    return this.unaryCall('resumeSession', request);
  }

  /** Cancel failed items in a paused session. */
  async cancelFailedItems(request: CancelFailedItemsRequest): Promise<CancelFailedItemsResponse> {
    return this.unaryCall('cancelFailedItems', request);
  }

  /** Cancel an entire sync session. */
  async cancelSession(request: CancelSessionRequest): Promise<CancelSessionResponse> {
    return this.unaryCall('cancelSession', request);
  }

  // ---------------------------------------------------------------------------
  // Server-streaming RPCs
  // ---------------------------------------------------------------------------

  /**
   * Execute a full collection sync. Returns an async iterable of SyncEvents
   * that can be consumed with `for await ... of`. Call `.cancel()` on the
   * returned object to abort the stream (e.g. on user-initiated cancel).
   */
  executeFullSync(request: FullSyncRequest): CancellableAsyncIterable<SyncEvent> {
    return this.serverStreamingCall('executeFullSync', request);
  }

  /**
   * Sync items parsed from a CSV export. Returns an async iterable of
   * SyncEvents with cancellation support.
   */
  syncFromCsv(request: SyncFromCsvRequest): CancellableAsyncIterable<SyncEvent> {
    return this.serverStreamingCall('syncFromCsv', request);
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  /** Promisify a unary gRPC call with auth metadata. */
  private unaryCall<TResponse>(method: string, request: unknown): Promise<TResponse> {
    return new Promise((resolve, reject) => {
      const client = getScraperGrpcClient();
      const metadata = createAuthMetadata();

      (client as any)[method](request, metadata, (err: ServiceError | null, response: TResponse) => {
        if (err) {
          reject(ScraperGrpcClient.mapGrpcError(err));
        } else {
          resolve(response);
        }
      });
    });
  }

  /**
   * Wrap a server-streaming gRPC call in a cancellable async iterable.
   *
   * The stream is consumed by buffering incoming events into a queue that
   * the async iterator pulls from. This avoids the pitfall of attaching
   * multiple one-shot `once` listeners that can miss events.
   */
  private serverStreamingCall<TResponse>(method: string, request: unknown): CancellableAsyncIterable<TResponse> {
    const client = getScraperGrpcClient();
    const metadata = createAuthMetadata();
    const stream: ClientReadableStream<TResponse> = (client as any)[method](request, metadata);

    // Event queue for the async iterator
    type QueueItem =
      | { type: 'data'; value: TResponse }
      | { type: 'end' }
      | { type: 'error'; error: Error };

    const queue: QueueItem[] = [];
    let resolve: ((item: QueueItem) => void) | null = null;
    let done = false;

    const push = (item: QueueItem) => {
      if (resolve) {
        const r = resolve;
        resolve = null;
        r(item);
      } else {
        queue.push(item);
      }
    };

    stream.on('data', (data: TResponse) => push({ type: 'data', value: data }));
    stream.on('end', () => { done = true; push({ type: 'end' }); });
    stream.on('error', (err: Error) => { done = true; push({ type: 'error', error: err }); });

    const pull = (): Promise<QueueItem> => {
      if (queue.length > 0) {
        return Promise.resolve(queue.shift()!);
      }
      return new Promise<QueueItem>((r) => { resolve = r; });
    };

    const asyncIterable: CancellableAsyncIterable<TResponse> = {
      [Symbol.asyncIterator]() {
        return {
          async next(): Promise<IteratorResult<TResponse>> {
            const item = await pull();
            switch (item.type) {
              case 'data':
                return { value: item.value, done: false };
              case 'end':
                return { value: undefined as any, done: true };
              case 'error':
                throw ScraperGrpcClient.mapGrpcError(item.error);
            }
          },
        };
      },
      cancel() {
        stream.cancel();
      },
    };

    return asyncIterable;
  }

  /** Map a gRPC error to an Error with an HTTP-compatible statusCode. */
  static mapGrpcError(err: any): GrpcMappedError {
    const httpStatus = GRPC_TO_HTTP_STATUS[err.code] ?? 500;
    const mapped = new Error(err.details || err.message) as GrpcMappedError;
    mapped.statusCode = httpStatus;
    mapped.grpcCode = err.code ?? 2; // default to UNKNOWN
    return mapped;
  }
}

// Singleton instance
let instance: ScraperGrpcClient | null = null;

/** Get or create the ScraperGrpcClient singleton. */
export function getScraperClient(): ScraperGrpcClient {
  if (!instance) {
    instance = new ScraperGrpcClient();
  }
  return instance;
}

// Re-export message types for convenience
export type {
  ValidateCookiesRequest,
  ValidateCookiesResponse,
  ParseCsvRequest,
  ParseCsvResponse,
  ScrapeGenericRequest,
  ScrapeGenericResponse,
  ScrapeConfig,
  GetQueueStatsRequest,
  GetQueueStatsResponse,
  GetSyncStatusRequest,
  GetSyncStatusResponse,
  GetCookieAllowlistRequest,
  GetCookieAllowlistResponse,
  ResumeSessionRequest,
  ResumeSessionResponse,
  CancelFailedItemsRequest,
  CancelFailedItemsResponse,
  CancelSessionRequest,
  CancelSessionResponse,
  FullSyncRequest,
  SyncFromCsvRequest,
  SyncEvent,
  CsvItem,
};
