import mongoose from 'mongoose';
import { FigureSearchResult, SearchOptions } from './types';
import { atlasUserSearch, atlasPublicSearch, atlasWordWheel } from './atlasSearchService';
import { regexUserSearch, regexPublicSearch, regexWordWheel } from './regexSearchService';
import { createLogger } from '../../utils/logger';

const logger = createLogger('SEARCH');

/**
 * Determine whether Atlas Search should be used.
 * Disabled during test mode and integration testing.
 */
const isAtlasEnabled = (): boolean => {
  return process.env.ENABLE_ATLAS_SEARCH === 'true' &&
         process.env.TEST_MODE !== 'memory' &&
         !process.env.INTEGRATION_TEST;
};

/**
 * User-scoped figure search with Atlas/regex routing and automatic fallback.
 */
export const figureSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId
): Promise<FigureSearchResult[]> => {
  if (!query?.trim()) return [];
  if (!isAtlasEnabled()) {
    logger.info(`Regex search for "${query}" (Atlas disabled)`);
    return regexUserSearch(query, userId);
  }
  try {
    const results = await atlasUserSearch(query, userId);
    logger.info(`Atlas search for "${query}": ${results.length} results`);
    return results;
  } catch (error) {
    logger.warn(`Atlas search failed for "${query}", falling back to regex:`, error instanceof Error ? error.message : 'Unknown error');
    return regexUserSearch(query, userId);
  }
};

/**
 * Public figure search (no userId filter or in results).
 */
export const publicSearch = async (
  query: string,
  options?: SearchOptions
): Promise<FigureSearchResult[]> => {
  if (!query?.trim()) return [];
  if (!isAtlasEnabled()) return regexPublicSearch(query, options);
  try {
    return await atlasPublicSearch(query, options);
  } catch (error) {
    logger.warn(`Atlas public search failed, falling back to regex:`, error instanceof Error ? error.message : 'Unknown error');
    return regexPublicSearch(query, options);
  }
};

/**
 * Word wheel autocomplete with Atlas/regex routing and automatic fallback.
 */
export const wordWheelSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  limit?: number
): Promise<FigureSearchResult[]> => {
  if (!query?.trim()) return [];
  if (!isAtlasEnabled()) return regexWordWheel(query, userId, limit);
  try {
    return await atlasWordWheel(query, userId, limit);
  } catch (error) {
    logger.warn(`Atlas word wheel failed, falling back to regex:`, error instanceof Error ? error.message : 'Unknown error');
    return regexWordWheel(query, userId, limit);
  }
};

// Re-export types and individual implementations
export { FigureSearchResult, SearchOptions } from './types';
export { computeRegexScore } from './regexSearchService';
