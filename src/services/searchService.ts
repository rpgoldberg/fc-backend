import mongoose from 'mongoose';
import Figure, { IFigure } from '../models/Figure';
import { createLogger } from '../utils/logger';

const logger = createLogger('SEARCH');

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

/**
 * Compute a relevance score for regex fallback matches.
 * Mimics Atlas Search scoring behavior for consistent UX.
 *
 * Scoring weights:
 * - Exact scale match: 2.0 (matches Atlas boost)
 * - Name starts with query: 1.5
 * - Manufacturer starts with query: 1.25
 * - Name contains query (not at start): 1.0
 * - Manufacturer contains query (not at start): 0.75
 * - Location/boxNumber contains: 0.5
 */
export const computeRegexScore = (doc: any, query: string): number => {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(t => t.length > 0);
  let score = 0;

  for (const term of terms) {
    const name = (doc.name || '').toLowerCase();
    const manufacturer = (doc.manufacturer || '').toLowerCase();
    const scale = (doc.scale || '').toLowerCase();
    const location = (doc.location || '').toLowerCase();
    const boxNumber = (doc.boxNumber || '').toLowerCase();

    // Exact scale match (highest priority, like Atlas boost)
    if (scale === term) {
      score += 2.0;
    }

    // Name scoring
    if (name.startsWith(term) || name.includes(` ${term}`)) {
      score += 1.5; // Word boundary match
    } else if (name.includes(term)) {
      score += 1.0; // Partial match
    }

    // Manufacturer scoring
    if (manufacturer.startsWith(term) || manufacturer.includes(` ${term}`)) {
      score += 1.25;
    } else if (manufacturer.includes(term)) {
      score += 0.75;
    }

    // Location/boxNumber (lower weight)
    if (location.includes(term)) score += 0.5;
    if (boxNumber.includes(term)) score += 0.5;
  }

  return Math.round(score * 100) / 100; // Round to 2 decimal places
};

/**
 * Word Wheel Search - Autocomplete suggestions as user types
 * Minimum 3 characters required (matches Atlas Search minGrams: 3)
 * Uses Atlas Search autocomplete analyzer or regex fallback
 */
export const wordWheelSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  limit: number = 10
): Promise<IFigure[]> => {
  // Require minimum 3 characters (matches Atlas Search minGrams configuration)
  if (!query || query.trim().length < 3) {
    return [];
  }

  const searchQuery = query.trim();

  // Escape special regex characters for safe searching
  const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Use Atlas Search when explicitly enabled via environment variable
  const useAtlasSearch = process.env.ENABLE_ATLAS_SEARCH === 'true' &&
                        process.env.TEST_MODE !== 'memory' &&
                        !process.env.INTEGRATION_TEST;

  if (!useAtlasSearch) {
    // Fallback: Use regex for autocomplete-style matching (word boundary or start of string)
    // Fetch more than limit to allow for re-ranking, but cap for performance
    const fetchLimit = Math.min(limit * 3, 50);
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { manufacturer: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .limit(fetchLimit)
      .lean();

    // Add computed scores and sort by relevance
    const scoredResults = results.map(doc => ({
      ...doc,
      searchScore: computeRegexScore(doc, searchQuery)
    }));
    scoredResults.sort((a, b) => b.searchScore - a.searchScore);

    return scoredResults.slice(0, limit) as unknown as IFigure[];
  }

  // Atlas Search compound autocomplete query (searches name, manufacturer, and scale)
  try {
    const results = await Figure.aggregate([
      {
        $search: {
          index: 'figures_search',
          compound: {
            should: [
              {
                autocomplete: {
                  query: searchQuery,
                  path: 'name',
                  fuzzy: {
                    maxEdits: 1
                  }
                }
              },
              {
                autocomplete: {
                  query: searchQuery,
                  path: 'manufacturer',
                  fuzzy: {
                    maxEdits: 1
                  }
                }
              },
              {
                equals: {
                  value: searchQuery,
                  path: 'scale',
                  score: { boost: { value: 2 } }
                }
              }
            ],
            minimumShouldMatch: 1
          }
        }
      },
      {
        $match: {
          userId
        }
      },
      {
        $addFields: {
          searchScore: { $meta: 'searchScore' }
        }
      },
      {
        $sort: { searchScore: -1 }
      },
      {
        $limit: limit
      },
      {
        $project: {
          _id: 1,
          manufacturer: 1,
          name: 1,
          scale: 1,
          mfcLink: 1,
          location: 1,
          boxNumber: 1,
          imageUrl: 1,
          userId: 1,
          createdAt: 1,
          updatedAt: 1,
          searchScore: 1
        }
      }
    ]);

    return results as IFigure[];
  } catch (error) {
    logger.error('Atlas Search error, falling back to regex:', error instanceof Error ? error.message : 'Unknown error');
    // Fallback to regex if Atlas Search fails
    const fetchLimit = Math.min(limit * 3, 50);
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { manufacturer: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .limit(fetchLimit)
      .lean();

    // Add computed scores and sort by relevance
    const scoredResults = results.map(doc => ({
      ...doc,
      searchScore: computeRegexScore(doc, searchQuery)
    }));
    scoredResults.sort((a, b) => b.searchScore - a.searchScore);

    return scoredResults.slice(0, limit) as unknown as IFigure[];
  }
};

/**
 * Partial Search - Finds partial matches within words
 * Minimum 3 characters required (matches Atlas Search minGrams: 3)
 * Uses n-gram and wildcard analyzers or regex fallback
 */
export const partialSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  options: SearchOptions = {}
): Promise<IFigure[]> => {
  // Require minimum 3 characters (matches Atlas Search minGrams configuration)
  if (!query || query.trim().length < 3) {
    return [];
  }

  const { limit = 10, offset = 0 } = options;
  const searchQuery = query.trim();

  // Escape special regex characters
  const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Use Atlas Search when explicitly enabled via environment variable
  const useAtlasSearch = process.env.ENABLE_ATLAS_SEARCH === 'true' &&
                        process.env.TEST_MODE !== 'memory' &&
                        !process.env.INTEGRATION_TEST;

  if (!useAtlasSearch) {
    // Fallback: Use regex for partial matching (anywhere in string)
    // Fetch more than needed to allow for re-ranking, but cap for performance
    const fetchLimit = Math.min((offset + limit) * 2, 100);
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { manufacturer: { $regex: escapedQuery, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .limit(fetchLimit)
      .lean();

    // Add computed scores and sort by relevance
    const scoredResults = results.map(doc => ({
      ...doc,
      searchScore: computeRegexScore(doc, searchQuery)
    }));
    scoredResults.sort((a, b) => b.searchScore - a.searchScore);

    return scoredResults.slice(offset, offset + limit) as unknown as IFigure[];
  }

  // Atlas Search text query for partial matching (name, manufacturer, scale)
  try {
    const results = await Figure.aggregate([
      {
        $search: {
          index: 'figures_search',
          compound: {
            should: [
              {
                text: {
                  query: searchQuery,
                  path: 'name'
                }
              },
              {
                text: {
                  query: searchQuery,
                  path: 'manufacturer'
                }
              },
              {
                equals: {
                  value: searchQuery,
                  path: 'scale',
                  score: { boost: { value: 2 } }
                }
              }
            ]
          }
        }
      },
      {
        $match: {
          userId
        }
      },
      {
        $addFields: {
          searchScore: { $meta: 'searchScore' }
        }
      },
      {
        $sort: { searchScore: -1 }
      },
      {
        $skip: offset
      },
      {
        $limit: limit
      },
      {
        $project: {
          _id: 1,
          manufacturer: 1,
          name: 1,
          scale: 1,
          mfcLink: 1,
          location: 1,
          boxNumber: 1,
          imageUrl: 1,
          userId: 1,
          createdAt: 1,
          updatedAt: 1,
          searchScore: 1
        }
      }
    ]);

    return results as IFigure[];
  } catch (error) {
    logger.error('Atlas Search error, falling back to regex:', error instanceof Error ? error.message : 'Unknown error');
    // Fallback to regex if Atlas Search fails
    const fetchLimit = Math.min((offset + limit) * 2, 100);
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { manufacturer: { $regex: escapedQuery, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .limit(fetchLimit)
      .lean();

    // Add computed scores and sort by relevance
    const scoredResults = results.map(doc => ({
      ...doc,
      searchScore: computeRegexScore(doc, searchQuery)
    }));
    scoredResults.sort((a, b) => b.searchScore - a.searchScore);

    return scoredResults.slice(offset, offset + limit) as unknown as IFigure[];
  }
};

/**
 * Figure Search - Full-text search for /figures/search endpoint
 * Searches across name, manufacturer, location, and boxNumber fields
 * Uses Atlas Search with autocomplete or regex fallback
 */
export const figureSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId
): Promise<IFigure[]> => {
  if (!query || query.trim().length === 0) {
    return [];
  }

  const searchQuery = query.trim();

  // Use Atlas Search when explicitly enabled via environment variable
  const useAtlasSearch = process.env.ENABLE_ATLAS_SEARCH === 'true' &&
                        process.env.TEST_MODE !== 'memory' &&
                        !process.env.INTEGRATION_TEST;

  if (!useAtlasSearch) {
    // Fallback: regex search across multiple fields
    const searchTerms = searchQuery.split(' ').filter(term => term.trim().length > 0);

    // Create regex patterns for each search term
    const regexConditions = searchTerms.map(term => ({
      $or: [
        { manufacturer: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { scale: { $regex: `^${term}$`, $options: 'i' } },
        { location: { $regex: term, $options: 'i' } },
        { boxNumber: { $regex: term, $options: 'i' } }
      ]
    }));

    // Fetch with performance cap
    const results = await Figure.find({
      userId,
      $and: regexConditions
    })
      .limit(100)
      .lean();

    // Add computed scores and sort by relevance
    const scoredResults = results.map(doc => ({
      ...doc,
      searchScore: computeRegexScore(doc, searchQuery)
    }));
    scoredResults.sort((a, b) => b.searchScore - a.searchScore);

    return scoredResults as unknown as IFigure[];
  }

  // Atlas Search with autocomplete for name, manufacturer, and scale
  try {
    const results = await Figure.aggregate([
      {
        $search: {
          index: 'figures_search',
          compound: {
            should: [
              {
                autocomplete: {
                  query: searchQuery,
                  path: 'name',
                  fuzzy: { maxEdits: 1 }
                }
              },
              {
                autocomplete: {
                  query: searchQuery,
                  path: 'manufacturer',
                  fuzzy: { maxEdits: 1 }
                }
              },
              {
                equals: {
                  value: searchQuery,
                  path: 'scale',
                  score: { boost: { value: 2 } }
                }
              }
            ],
            minimumShouldMatch: 1
          }
        }
      },
      {
        $match: {
          userId
        }
      },
      {
        $addFields: {
          searchScore: { $meta: 'searchScore' }
        }
      },
      {
        $sort: { searchScore: -1 }
      },
      {
        $project: {
          _id: 1,
          manufacturer: 1,
          name: 1,
          scale: 1,
          mfcLink: 1,
          location: 1,
          boxNumber: 1,
          imageUrl: 1,
          userId: 1,
          createdAt: 1,
          updatedAt: 1,
          searchScore: 1
        }
      }
    ]);

    return results as IFigure[];
  } catch (error) {
    logger.error('Atlas Search error, falling back to regex:', error instanceof Error ? error.message : 'Unknown error');
    // Fallback to regex if Atlas Search fails
    const searchTerms = searchQuery.split(' ').filter(term => term.trim().length > 0);
    const regexConditions = searchTerms.map(term => ({
      $or: [
        { manufacturer: { $regex: term, $options: 'i' } },
        { name: { $regex: term, $options: 'i' } },
        { scale: { $regex: `^${term}$`, $options: 'i' } },
        { location: { $regex: term, $options: 'i' } },
        { boxNumber: { $regex: term, $options: 'i' } }
      ]
    }));

    // Fetch with performance cap
    const results = await Figure.find({
      userId,
      $and: regexConditions
    })
      .limit(100)
      .lean();

    // Add computed scores and sort by relevance
    const scoredResults = results.map(doc => ({
      ...doc,
      searchScore: computeRegexScore(doc, searchQuery)
    }));
    scoredResults.sort((a, b) => b.searchScore - a.searchScore);

    return scoredResults as unknown as IFigure[];
  }
};
