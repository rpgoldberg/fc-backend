/** Check whether the gRPC transport is enabled via feature flag. */
export function isGrpcEnabled(): boolean {
  return process.env.USE_GRPC === 'true';
}

export { getScraperClient, ScraperGrpcClient } from './scraperClient';
export type { GrpcMappedError, CancellableAsyncIterable } from './scraperClient';
export { closeScraperGrpcClient } from './client';
