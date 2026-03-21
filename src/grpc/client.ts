import * as grpc from '@grpc/grpc-js';
import type { ScraperServiceClient as ScraperServiceClientType } from './generated/figure_collector/v1/scraper_service';

let client: ScraperServiceClientType | null = null;

/** Resolve the scraper gRPC address from environment (evaluated per-call). */
function getScraperGrpcUrl(): string {
  return process.env.SCRAPER_GRPC_URL || 'localhost:3051';
}

/** Resolve the service auth token from environment (evaluated per-call). */
function getAuthToken(): string | undefined {
  return process.env.SCRAPER_AUTH_TOKEN || process.env.SERVICE_AUTH_TOKEN;
}

/**
 * Get or create the gRPC client singleton for the scraper service.
 * Uses lazy require() to avoid import-time errors when generated code
 * is not yet available (e.g. in test environments).
 */
export function getScraperGrpcClient(): ScraperServiceClientType {
  if (!client) {
    // Lazy require to avoid import-time failures in tests/environments
    // where the generated code may not be compiled yet
    const { ScraperServiceClient } = require('./generated/figure_collector/v1/scraper_service');

    client = new ScraperServiceClient(
      getScraperGrpcUrl(),
      grpc.credentials.createInsecure(), // TLS handled by Linkerd sidecar in production
    ) as ScraperServiceClientType;
  }
  return client;
}

/** Create gRPC metadata with the service auth token attached. */
export function createAuthMetadata(): grpc.Metadata {
  const metadata = new grpc.Metadata();
  const token = getAuthToken();
  if (token) {
    metadata.set('authorization', `Bearer ${token}`);
  }
  return metadata;
}

/** Close the gRPC client connection and clear the singleton. */
export function closeScraperGrpcClient(): void {
  if (client) {
    client.close();
    client = null;
  }
}
