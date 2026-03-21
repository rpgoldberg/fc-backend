import mongoose from 'mongoose';
import Figure, { IFigure } from '../models/Figure';
import DuplicateDismissal from '../models/DuplicateDismissal';

/**
 * Match type indicating which detection strategy identified the pair.
 *  - exact_mfc:  Both figures share the same mfcId (definite duplicate)
 *  - jan_match:  Both figures share the same JAN barcode
 *  - name_fuzzy: Normalized names are highly similar (Jaccard token overlap)
 *  - manufacturer_name_scale: Same manufacturer + similar name + same scale
 */
export type MatchType = 'exact_mfc' | 'jan_match' | 'name_fuzzy' | 'manufacturer_name_scale';

export interface DuplicateCandidate {
  figureA: string;  // ObjectId as string
  figureB: string;  // ObjectId as string
  confidence: number;  // 0-1
  reasons: string[];
  matchType: MatchType;
}

/** Minimum Jaccard similarity to consider a name match */
const FUZZY_THRESHOLD = 0.6;

/** Minimum Jaccard similarity for the name component when combined with manufacturer+scale */
const COMBINED_NAME_THRESHOLD = 0.5;

/**
 * Normalize a figure name for comparison.
 * Removes special characters, common filler words, and collapses whitespace.
 */
export function normalizeName(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^\w\s]/g, '')      // Remove special characters
    .replace(/\b(ver|version|scale|figure|statue|pvc|abs)\b/g, '')  // Remove common words
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Calculate Jaccard similarity between two strings based on token overlap.
 * Returns a value between 0 (no overlap) and 1 (identical token sets).
 */
export function similarity(a: string, b: string): number {
  const tokensA = new Set(a.split(' ').filter(t => t.length > 0));
  const tokensB = new Set(b.split(' ').filter(t => t.length > 0));

  if (tokensA.size === 0 && tokensB.size === 0) return 1;
  if (tokensA.size === 0 || tokensB.size === 0) return 0;

  let intersectionSize = 0;
  for (const token of tokensA) {
    if (tokensB.has(token)) {
      intersectionSize++;
    }
  }

  const unionSize = tokensA.size + tokensB.size - intersectionSize;
  return intersectionSize / unionSize;
}

/**
 * Build a set of canonical pair keys from dismissed records.
 * Each key is "smallerId:largerId" so lookup is order-independent.
 */
function buildDismissedSet(dismissals: Array<{ figureAId: mongoose.Types.ObjectId; figureBId: mongoose.Types.ObjectId }>): Set<string> {
  const set = new Set<string>();
  for (const d of dismissals) {
    const a = d.figureAId.toString();
    const b = d.figureBId.toString();
    const key = a < b ? `${a}:${b}` : `${b}:${a}`;
    set.add(key);
  }
  return set;
}

/**
 * Check whether a pair has been dismissed.
 */
function isDismissed(dismissedSet: Set<string>, idA: string, idB: string): boolean {
  const key = idA < idB ? `${idA}:${idB}` : `${idB}:${idA}`;
  return dismissedSet.has(key);
}

/**
 * Deduplicate candidate list — keep only the highest-confidence entry per pair.
 */
function deduplicateCandidates(candidates: DuplicateCandidate[]): DuplicateCandidate[] {
  const bestByPair = new Map<string, DuplicateCandidate>();
  for (const c of candidates) {
    const key = c.figureA < c.figureB ? `${c.figureA}:${c.figureB}` : `${c.figureB}:${c.figureA}`;
    const existing = bestByPair.get(key);
    if (!existing || c.confidence > existing.confidence) {
      // Merge reasons from lower-confidence matches
      if (existing) {
        const mergedReasons = [...new Set([...c.reasons, ...existing.reasons])];
        bestByPair.set(key, { ...c, reasons: mergedReasons });
      } else {
        bestByPair.set(key, c);
      }
    } else if (existing) {
      // Add reasons from this lower-confidence match to existing
      const mergedReasons = [...new Set([...existing.reasons, ...c.reasons])];
      bestByPair.set(key, { ...existing, reasons: mergedReasons });
    }
  }
  return Array.from(bestByPair.values());
}

/**
 * Scan a user's collection for potential duplicate figures.
 * Applies multiple detection strategies and returns ranked candidates,
 * excluding any previously dismissed pairs.
 */
export async function detectDuplicates(userId: string): Promise<DuplicateCandidate[]> {
  const figures = await Figure.find({ userId }).lean<IFigure[]>();

  if (figures.length < 2) {
    return [];
  }

  // Load dismissed pairs for this user
  const dismissals = await DuplicateDismissal.find({ userId }).lean();
  const dismissedSet = buildDismissedSet(dismissals);

  const candidates: DuplicateCandidate[] = [];

  // Pre-compute normalized names for fuzzy matching
  const normalizedNames = new Map<string, string>();
  for (const fig of figures) {
    normalizedNames.set(fig._id.toString(), normalizeName(fig.name));
  }

  // --- Strategy 1: Exact MFC ID match (confidence 1.0) ---
  const mfcIdMap = new Map<number, IFigure[]>();
  for (const fig of figures) {
    if (fig.mfcId != null) {
      const existing = mfcIdMap.get(fig.mfcId);
      if (existing) {
        existing.push(fig);
      } else {
        mfcIdMap.set(fig.mfcId, [fig]);
      }
    }
  }
  for (const [mfcId, group] of mfcIdMap) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const idA = group[i]._id.toString();
        const idB = group[j]._id.toString();
        if (!isDismissed(dismissedSet, idA, idB)) {
          candidates.push({
            figureA: idA,
            figureB: idB,
            confidence: 1.0,
            reasons: [`Same MFC ID: ${mfcId}`],
            matchType: 'exact_mfc'
          });
        }
      }
    }
  }

  // --- Strategy 2: JAN barcode match (confidence 0.95) ---
  const janMap = new Map<string, IFigure[]>();
  for (const fig of figures) {
    if (fig.jan) {
      const jan = fig.jan.trim();
      if (jan.length > 0) {
        const existing = janMap.get(jan);
        if (existing) {
          existing.push(fig);
        } else {
          janMap.set(jan, [fig]);
        }
      }
    }
  }
  for (const [jan, group] of janMap) {
    for (let i = 0; i < group.length; i++) {
      for (let j = i + 1; j < group.length; j++) {
        const idA = group[i]._id.toString();
        const idB = group[j]._id.toString();
        if (!isDismissed(dismissedSet, idA, idB)) {
          candidates.push({
            figureA: idA,
            figureB: idB,
            confidence: 0.95,
            reasons: [`Same JAN barcode: ${jan}`],
            matchType: 'jan_match'
          });
        }
      }
    }
  }

  // --- Strategy 3: Fuzzy name matching (confidence = similarity score, if >= threshold) ---
  for (let i = 0; i < figures.length; i++) {
    for (let j = i + 1; j < figures.length; j++) {
      const idA = figures[i]._id.toString();
      const idB = figures[j]._id.toString();

      if (isDismissed(dismissedSet, idA, idB)) continue;

      const nameA = normalizedNames.get(idA)!;
      const nameB = normalizedNames.get(idB)!;
      const sim = similarity(nameA, nameB);

      if (sim >= FUZZY_THRESHOLD) {
        candidates.push({
          figureA: idA,
          figureB: idB,
          confidence: parseFloat((sim * 0.85).toFixed(2)),  // Scale down: name alone is less certain
          reasons: [`Similar names (${Math.round(sim * 100)}% match): "${figures[i].name}" vs "${figures[j].name}"`],
          matchType: 'name_fuzzy'
        });
      }
    }
  }

  // --- Strategy 4: Same manufacturer + similar name + same scale (confidence 0.9) ---
  for (let i = 0; i < figures.length; i++) {
    for (let j = i + 1; j < figures.length; j++) {
      const a = figures[i];
      const b = figures[j];

      if (!a.manufacturer || !b.manufacturer) continue;
      if (!a.scale || !b.scale) continue;

      const idA = a._id.toString();
      const idB = b._id.toString();

      if (isDismissed(dismissedSet, idA, idB)) continue;

      const sameManufacturer = a.manufacturer.toLowerCase().trim() === b.manufacturer.toLowerCase().trim();
      const sameScale = a.scale.toLowerCase().trim() === b.scale.toLowerCase().trim();

      if (!sameManufacturer || !sameScale) continue;

      const nameA = normalizedNames.get(idA)!;
      const nameB = normalizedNames.get(idB)!;
      const sim = similarity(nameA, nameB);

      if (sim >= COMBINED_NAME_THRESHOLD) {
        candidates.push({
          figureA: idA,
          figureB: idB,
          confidence: 0.9,
          reasons: [
            `Same manufacturer: ${a.manufacturer}`,
            `Same scale: ${a.scale}`,
            `Similar names (${Math.round(sim * 100)}% match)`
          ],
          matchType: 'manufacturer_name_scale'
        });
      }
    }
  }

  // Deduplicate (keep highest-confidence per pair) and sort descending
  return deduplicateCandidates(candidates).sort((a, b) => b.confidence - a.confidence);
}

/**
 * Merge two figures: keep the target, delete the source, combine user-specific data.
 * The target figure gains any data that the source has but the target lacks.
 * Returns the updated target figure.
 */
export async function mergeFigures(
  userId: string,
  targetId: string,
  sourceId: string
): Promise<IFigure> {
  const target = await Figure.findOne({ _id: targetId, userId });
  const source = await Figure.findOne({ _id: sourceId, userId });

  if (!target) {
    throw new Error('Target figure not found');
  }
  if (!source) {
    throw new Error('Source figure not found');
  }

  // Merge: fill in blanks on target from source
  if (!target.mfcId && source.mfcId) target.mfcId = source.mfcId;
  if (!target.mfcLink && source.mfcLink) target.mfcLink = source.mfcLink;
  if (!target.jan && source.jan) target.jan = source.jan;
  if (!target.imageUrl && source.imageUrl) target.imageUrl = source.imageUrl;
  if (!target.scale && source.scale) target.scale = source.scale;
  if (!target.manufacturer && source.manufacturer) target.manufacturer = source.manufacturer;
  if (!target.origin && source.origin) target.origin = source.origin;
  if (!target.category && source.category) target.category = source.category;
  if (!target.rating && source.rating) target.rating = source.rating;
  if (!target.note && source.note) target.note = source.note;

  // Merge tags (union)
  if (source.tags && source.tags.length > 0) {
    const existingTags = new Set(target.tags || []);
    for (const tag of source.tags) {
      existingTags.add(tag);
    }
    target.tags = Array.from(existingTags);
  }

  // Merge imageUrls (union, preserving order with target first)
  if (source.imageUrls && source.imageUrls.length > 0) {
    const existingUrls = new Set(target.imageUrls || []);
    for (const url of source.imageUrls) {
      if (!existingUrls.has(url)) {
        target.imageUrls = target.imageUrls || [];
        target.imageUrls.push(url);
        existingUrls.add(url);
      }
    }
  }

  await target.save();

  // Delete source figure
  await Figure.deleteOne({ _id: sourceId, userId });

  // Clean up any dismissals referencing the source figure
  await DuplicateDismissal.deleteMany({
    userId,
    $or: [{ figureAId: sourceId }, { figureBId: sourceId }]
  });

  return target;
}
