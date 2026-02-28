import mongoose from 'mongoose';
import Figure from '../../models/Figure';
import { FigureSearchResult, SearchOptions } from './types';

/**
 * Compute a relevance score for regex fallback matches.
 *
 * Scoring weights:
 * - Exact scale match: 2.0
 * - Name starts with / word boundary: 1.5
 * - Name partial match: 1.0
 * - Manufacturer starts with / word boundary: 1.25
 * - Manufacturer partial match: 0.75
 * - Origin or category match: 0.75
 * - Tag match: 0.5
 *
 * Does NOT score location or boxNumber.
 */
export const computeRegexScore = (doc: any, query: string): number => {
  const q = query.toLowerCase();
  const terms = q.split(/\s+/).filter(t => t.length > 0);
  let score = 0;

  for (const term of terms) {
    const name = (doc.name || '').toLowerCase();
    const manufacturer = (doc.manufacturer || '').toLowerCase();
    const scale = (doc.scale || '').toLowerCase();
    const origin = (doc.origin || '').toLowerCase();
    const category = (doc.category || '').toLowerCase();
    const tags: string[] = (doc.tags || []).map((t: string) => (t || '').toLowerCase());

    // Exact scale match (highest priority)
    if (scale === term) {
      score += 2.0;
    }

    // Name scoring
    if (name.startsWith(term) || name.includes(` ${term}`)) {
      score += 1.5;
    } else if (name.includes(term)) {
      score += 1.0;
    }

    // Manufacturer scoring
    if (manufacturer.startsWith(term) || manufacturer.includes(` ${term}`)) {
      score += 1.25;
    } else if (manufacturer.includes(term)) {
      score += 0.75;
    }

    // Origin/category scoring
    if (origin.includes(term)) score += 0.75;
    if (category.includes(term)) score += 0.75;

    // Tag scoring
    if (tags.some(t => t.includes(term))) score += 0.5;
  }

  return Math.round(score * 100) / 100;
};

/**
 * Build regex conditions for a search term across all searchable fields.
 */
const buildTermConditions = (term: string): Record<string, any> => {
  const escapedTerm = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return {
    $or: [
      { name: { $regex: escapedTerm, $options: 'i' } },
      { manufacturer: { $regex: escapedTerm, $options: 'i' } },
      { scale: { $regex: `^${escapedTerm}$`, $options: 'i' } },
      { origin: { $regex: escapedTerm, $options: 'i' } },
      { category: { $regex: escapedTerm, $options: 'i' } },
      { tags: { $regex: escapedTerm, $options: 'i' } },
      { 'companyRoles.companyName': { $regex: escapedTerm, $options: 'i' } },
      { 'artistRoles.artistName': { $regex: escapedTerm, $options: 'i' } },
      { 'releases.jan': { $regex: escapedTerm, $options: 'i' } }
    ]
  };
};

/**
 * Map a lean Figure document to FigureSearchResult.
 */
const mapToResult = (doc: any, query: string, includeUserId: boolean): FigureSearchResult => {
  const result: FigureSearchResult = {
    _id: doc._id,
    name: doc.name,
    manufacturer: doc.manufacturer,
    scale: doc.scale,
    mfcLink: doc.mfcLink,
    imageUrl: doc.imageUrl,
    origin: doc.origin,
    category: doc.category,
    tags: doc.tags,
    companyRoles: doc.companyRoles,
    artistRoles: doc.artistRoles,
    searchScore: computeRegexScore(doc, query)
  };
  if (includeUserId) {
    result.userId = doc.userId;
  }
  return result;
};

/**
 * User-scoped regex search across the Figure collection.
 */
export const regexUserSearch = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  options?: SearchOptions
): Promise<FigureSearchResult[]> => {
  if (!query?.trim()) return [];

  const searchQuery = query.trim();
  const terms = searchQuery.split(/\s+/).filter(t => t.length > 0);
  const termConditions = terms.map(buildTermConditions);

  const docs = await Figure.find({
    userId,
    $and: termConditions
  })
    .limit(100)
    .lean();

  const results = docs.map(doc => mapToResult(doc, searchQuery, true));
  results.sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));
  return results;
};

/**
 * Public regex search (no userId filter, userId omitted from results).
 */
export const regexPublicSearch = async (
  query: string,
  options?: SearchOptions
): Promise<FigureSearchResult[]> => {
  if (!query?.trim()) return [];

  const searchQuery = query.trim();
  const terms = searchQuery.split(/\s+/).filter(t => t.length > 0);
  const termConditions = terms.map(buildTermConditions);

  const docs = await Figure.find({
    $and: termConditions
  })
    .limit(100)
    .lean();

  const results = docs.map(doc => mapToResult(doc, searchQuery, false));
  results.sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));
  return results;
};

/**
 * Word wheel autocomplete — minimum 3 characters.
 */
export const regexWordWheel = async (
  query: string,
  userId: mongoose.Types.ObjectId,
  limit: number = 10
): Promise<FigureSearchResult[]> => {
  if (!query || query.trim().length < 3) return [];

  const searchQuery = query.trim();
  const escapedQuery = searchQuery.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const fetchLimit = Math.min(limit * 3, 50);

  const docs = await Figure.find({
    userId,
    $or: [
      { name: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
      { manufacturer: { $regex: `(^|\\s)${escapedQuery}`, $options: 'i' } },
      { scale: { $regex: `^${escapedQuery}$`, $options: 'i' } }
    ]
  })
    .limit(fetchLimit)
    .lean();

  const results = docs.map(doc => mapToResult(doc, searchQuery, true));
  results.sort((a, b) => (b.searchScore || 0) - (a.searchScore || 0));
  return results.slice(0, limit);
};
