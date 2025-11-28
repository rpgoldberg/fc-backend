import mongoose from 'mongoose';
import Figure, { IFigure } from '../models/Figure';

export interface SearchOptions {
  limit?: number;
  offset?: number;
}

/**
 * Word Wheel Search - Autocomplete suggestions as user types
 * Minimum 2 characters required
 * Uses Atlas Search autocomplete analyzer or regex fallback
 */
export const wordWheelSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  limit: number = 10
): Promise<IFigure[]> => {
  // Require minimum 2 characters
  if (!query || query.trim().length < 2) {
    return [];
  }

  const searchQuery = query.trim();

  // Escape special regex characters for safe searching
  const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Check if we should use Atlas Search or fallback
  const useAtlasSearch = process.env.NODE_ENV === 'production' &&
                        process.env.TEST_MODE !== 'memory' &&
                        !process.env.INTEGRATION_TEST;

  if (!useAtlasSearch) {
    // Fallback: Use regex for autocomplete-style matching (word boundary or start of string)
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
        { manufacturer: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } }
      ]
    })
      .limit(limit)
      .sort({ name: 1 })
      .lean();

    return results as unknown as IFigure[];
  }

  // Atlas Search autocomplete query
  try {
    const results = await Figure.aggregate([
      {
        $search: {
          index: 'figures_search',
          autocomplete: {
            query: searchQuery,
            path: 'name',
            fuzzy: {
              maxEdits: 1
            }
          }
        }
      },
      {
        $match: {
          userId
        }
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
        { manufacturer: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } }
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
 * Minimum 2 characters required
 * Uses n-gram and wildcard analyzers or regex fallback
 */
export const partialSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  options: SearchOptions = {}
): Promise<IFigure[]> => {
  // Require minimum 2 characters
  if (!query || query.trim().length < 2) {
    return [];
  }

  const { limit = 10, offset = 0 } = options;
  const searchQuery = query.trim();

  // Escape special regex characters
  const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

  // Check if we should use Atlas Search or fallback
  const useAtlasSearch = process.env.NODE_ENV === 'production' &&
                        process.env.TEST_MODE !== 'memory' &&
                        !process.env.INTEGRATION_TEST;

  if (!useAtlasSearch) {
    // Fallback: Use regex for partial matching (anywhere in string)
    const results = await Figure.find({
      userId,
      $or: [
        { name: { $regex: escapedQuery, $options: 'i' } },
        { manufacturer: { $regex: escapedQuery, $options: 'i' } }
      ]
    })
      .skip(offset)
      .limit(limit)
      .sort({ name: 1 })
      .lean();

    return results as unknown as IFigure[];
  }

  // Atlas Search text query for partial matching
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
        { manufacturer: { $regex: escapedQuery, $options: 'i' } }
      ]
    })
      .skip(offset)
      .limit(limit)
      .sort({ name: 1 })
      .lean();

    return results as unknown as IFigure[];
  }
};
