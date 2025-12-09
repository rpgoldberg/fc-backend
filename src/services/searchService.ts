import mongoose from 'mongoose';
import Figure, { IFigure } from '../models/Figure';

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

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
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { manufacturer: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .limit(limit)
      .sort({ name: 1 })
      .lean();

    return results as unknown as IFigure[];
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
          updatedAt: 1
        }
      }
    ]);

    return results as IFigure[];
  } catch (error) {
    console.error('[SEARCH] Atlas Search error, falling back to regex:', error);
    // Fallback to regex if Atlas Search fails
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { manufacturer: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .limit(limit)
      .sort({ name: 1 })
      .lean();

    return results as unknown as IFigure[];
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
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { manufacturer: { $regex: escapedQuery, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .skip(offset)
      .limit(limit)
      .sort({ name: 1 })
      .lean();

    return results as unknown as IFigure[];
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
          updatedAt: 1
        }
      }
    ]);

    return results as IFigure[];
  } catch (error) {
    console.error('[SEARCH] Atlas Search error, falling back to regex:', error);
    // Fallback to regex if Atlas Search fails
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { manufacturer: { $regex: escapedQuery, $options: 'i' } },
        { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
      ]
    })
      .skip(offset)
      .limit(limit)
      .sort({ name: 1 })
      .lean();

    return results as unknown as IFigure[];
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

    const results = await Figure.find({
      userId,
      $and: regexConditions
    }).lean();

    return results as unknown as IFigure[];
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
          updatedAt: 1
        }
      }
    ]);

    return results as IFigure[];
  } catch (error) {
    console.error('[SEARCH] Atlas Search error, falling back to regex:', error);
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

    const results = await Figure.find({
      userId,
      $and: regexConditions
    }).lean();

    return results as unknown as IFigure[];
  }
};
