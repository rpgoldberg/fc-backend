import mongoose from 'mongoose';
import SearchIndex from '../../models/SearchIndex';
import { FigureSearchResult, SearchOptions } from './types';

/**
 * Derive the manufacturer name from companyRoles array.
 */
const deriveManufacturer = (
  companyRoles?: Array<{ companyName: string; roleName: string }>
): string | undefined => {
  if (!companyRoles || companyRoles.length === 0) return undefined;
  const mfr = companyRoles.find(cr => cr.roleName === 'Manufacturer');
  return mfr?.companyName || companyRoles[0]?.companyName;
};

/**
 * Map a raw SearchIndex aggregation result to FigureSearchResult.
 */
const mapResult = (doc: any, includeUserId: boolean): FigureSearchResult => {
  const result: FigureSearchResult = {
    _id: doc.entityId,
    name: doc.figureName || '',
    manufacturer: deriveManufacturer(doc.companyRoles),
    scale: doc.scale,
    mfcLink: doc.mfcLink,
    imageUrl: doc.imageUrl,
    origin: doc.origin,
    category: doc.category,
    tags: doc.tags,
    companyRoles: doc.companyRoles,
    artistRoles: doc.artistRoles,
    searchScore: doc.searchScore
  };
  if (includeUserId) {
    result.userId = doc.userId;
  }
  return result;
};

/**
 * Atlas Search user-scoped search via the unified_search index on SearchIndex collection.
 */
export const atlasUserSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  options?: SearchOptions
): Promise<FigureSearchResult[]> => {
  if (!query?.trim()) return [];

  const searchQuery = query.trim();

  const results = await SearchIndex.aggregate([
    {
      $search: {
        index: 'unified_search',
        compound: {
          filter: [
            { equals: { path: 'entityType', value: 'figure' } },
            { equals: { path: 'userId', value: userId } }
          ],
          should: [
            {
              autocomplete: {
                query: searchQuery,
                path: 'searchText',
                fuzzy: { maxEdits: 1 }
              }
            },
            {
              text: {
                query: searchQuery,
                path: 'nameSearchable'
              }
            }
          ],
          minimumShouldMatch: 1
        }
      }
    },
    { $addFields: { searchScore: { $meta: 'searchScore' } } },
    { $sort: { searchScore: -1 } },
    { $limit: 100 }
  ]);

  return results.map(doc => mapResult(doc, true));
};

/**
 * Atlas Search public search (no userId filter, userId omitted from results).
 */
export const atlasPublicSearch = async (
  query: string,
  options?: SearchOptions
): Promise<FigureSearchResult[]> => {
  if (!query?.trim()) return [];

  const searchQuery = query.trim();

  const results = await SearchIndex.aggregate([
    {
      $search: {
        index: 'unified_search',
        compound: {
          filter: [
            { equals: { path: 'entityType', value: 'figure' } }
          ],
          should: [
            {
              autocomplete: {
                query: searchQuery,
                path: 'searchText',
                fuzzy: { maxEdits: 1 }
              }
            },
            {
              text: {
                query: searchQuery,
                path: 'nameSearchable'
              }
            }
          ],
          minimumShouldMatch: 1
        }
      }
    },
    { $addFields: { searchScore: { $meta: 'searchScore' } } },
    { $sort: { searchScore: -1 } },
    { $limit: 100 }
  ]);

  return results.map(doc => mapResult(doc, false));
};

/**
 * Atlas Search word wheel autocomplete — minimum 3 chars, autocomplete path only.
 */
export const atlasWordWheel = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  limit: number = 10
): Promise<FigureSearchResult[]> => {
  if (!query || query.trim().length < 3) return [];

  const searchQuery = query.trim();

  const results = await SearchIndex.aggregate([
    {
      $search: {
        index: 'unified_search',
        compound: {
          filter: [
            { equals: { path: 'entityType', value: 'figure' } },
            { equals: { path: 'userId', value: userId } }
          ],
          should: [
            {
              autocomplete: {
                query: searchQuery,
                path: 'searchText',
                fuzzy: { maxEdits: 1 }
              }
            }
          ],
          minimumShouldMatch: 1
        }
      }
    },
    { $addFields: { searchScore: { $meta: 'searchScore' } } },
    { $sort: { searchScore: -1 } },
    { $limit: limit }
  ]);

  return results.map(doc => mapResult(doc, true));
};
