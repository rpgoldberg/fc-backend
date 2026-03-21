import mongoose from 'mongoose';
import Figure, { IFigure } from '../models/Figure';
import { createLogger } from '../utils/logger';

const logger = createLogger('COLLECTION_DNA');

// --- Interfaces ---

export interface AffinityItem {
  name: string;
  count: number;
  percentage: number;
}

export interface CollectionDna {
  // Core identity
  collectorType: string;
  totalFigures: number;
  collectionAge: string;

  // Top affinities
  topSeries: AffinityItem[];
  topManufacturers: AffinityItem[];
  topScales: AffinityItem[];
  topCategories: AffinityItem[];

  // Fun stats
  rarityScore: number;
  diversityScore: number;
  loyaltyScore: number;

  // Patterns
  favoriteCharacter?: string;
  biggestMonth: { month: string; count: number };
  averagePrice: number;
  estimatedValue: number;

  // Collector archetype description
  archetypeDescription: string;
}

// --- Helpers (exported for unit testing) ---

/**
 * Aggregate items by a key, returning sorted AffinityItem arrays.
 * Normalizes by lowercasing for grouping but preserves the first-seen display name.
 */
export function aggregateByField(
  figures: Array<Record<string, any>>,
  fieldAccessor: (fig: Record<string, any>) => string | undefined | null,
  total: number,
  limit = 5
): AffinityItem[] {
  const counts = new Map<string, { displayName: string; count: number }>();

  for (const fig of figures) {
    const raw = fieldAccessor(fig);
    if (!raw) continue;
    const key = raw.toLowerCase();
    const existing = counts.get(key);
    if (existing) {
      existing.count++;
    } else {
      counts.set(key, { displayName: raw, count: 1 });
    }
  }

  return Array.from(counts.values())
    .sort((a, b) => b.count - a.count)
    .slice(0, limit)
    .map(({ displayName, count }) => ({
      name: displayName,
      count,
      percentage: total > 0 ? Math.round((count / total) * 1000) / 10 : 0,
    }));
}

/**
 * Shannon entropy diversity score normalized to 0-100.
 * Measures how evenly distributed figures are across categories.
 * 0 = all in one bucket, 100 = perfectly even distribution.
 */
export function calculateDiversityScore(items: AffinityItem[], total: number): number {
  if (total === 0 || items.length === 0) return 0;
  if (items.length === 1) return 0;

  // Calculate Shannon entropy
  let entropy = 0;
  for (const item of items) {
    const p = item.count / total;
    if (p > 0) {
      entropy -= p * Math.log2(p);
    }
  }

  // Normalize to 0-100 (max entropy = log2(n) for n categories)
  const maxEntropy = Math.log2(items.length);
  if (maxEntropy === 0) return 0;

  return Math.round((entropy / maxEntropy) * 100);
}

/**
 * Loyalty score: how concentrated a collection is toward a single manufacturer.
 * High loyalty = high concentration in one manufacturer.
 * 0 = perfectly even, 100 = all from one manufacturer.
 */
export function calculateLoyaltyScore(topManufacturers: AffinityItem[], total: number): number {
  if (total === 0 || topManufacturers.length === 0) return 0;
  const topCount = topManufacturers[0].count;
  return Math.round((topCount / total) * 100);
}

/**
 * Rarity score based on how uncommon the collector's figure categories are.
 * Uses inverse popularity weighting: figures in less-common categories score higher.
 * This is a self-contained heuristic (no cross-user comparison needed).
 *
 * Scale figures and limited editions score higher; common prize figures score lower.
 */
export function calculateRarityScore(figures: Array<Record<string, any>>): number {
  if (figures.length === 0) return 0;

  // Category rarity weights (higher = rarer in the hobby)
  const rarityWeights: Record<string, number> = {
    'scale figure': 0.7,
    'action figure': 0.5,
    'nendoroid': 0.4,
    'figma': 0.5,
    'prize figure': 0.2,
    'trading figure': 0.15,
    'garage kit': 0.9,
    'doll': 0.6,
    'plush': 0.1,
    'goods': 0.1,
  };

  let totalWeight = 0;
  let counted = 0;

  for (const fig of figures) {
    const category = (fig.category || fig.type || '').toLowerCase();
    // Check for partial matches (e.g., "1/7 Scale Figure" should match "scale figure")
    let weight = 0.3; // default for unknown categories
    for (const [key, w] of Object.entries(rarityWeights)) {
      if (category.includes(key)) {
        weight = w;
        break;
      }
    }

    // Bonus for having purchase info (indicates intent/investment)
    if (fig.purchaseInfo?.price) {
      weight = Math.min(weight + 0.1, 1.0);
    }

    totalWeight += weight;
    counted++;
  }

  if (counted === 0) return 0;
  return Math.round((totalWeight / counted) * 100);
}

/**
 * Determine the collector archetype based on collection composition.
 */
export function determineCollectorType(
  figures: Array<Record<string, any>>,
  topSeries: AffinityItem[],
  topManufacturers: AffinityItem[],
  topCategories: AffinityItem[],
  total: number
): string {
  if (total === 0) return 'Newcomer';

  // Check category dominance
  const categoryMap = new Map<string, number>();
  for (const fig of figures) {
    const cat = (fig.category || fig.type || 'unknown').toLowerCase();
    categoryMap.set(cat, (categoryMap.get(cat) || 0) + 1);
  }

  const scaleCount = figures.filter((f) => {
    const cat = (f.category || f.type || '').toLowerCase();
    return cat.includes('scale');
  }).length;

  const nendoroidCount = figures.filter((f) => {
    const cat = (f.category || f.type || '').toLowerCase();
    return cat.includes('nendoroid');
  }).length;

  // Scale Purist: 70%+ scale figures
  if (scaleCount / total >= 0.7) return 'Scale Purist';

  // Nendoroid Army: 70%+ Nendoroids
  if (nendoroidCount / total >= 0.7) return 'Nendoroid Army';

  // Series Devotee: 50%+ from one series
  if (topSeries.length > 0 && topSeries[0].count / total >= 0.5) {
    return 'Series Devotee';
  }

  // Manufacturer Loyalist: 50%+ from one manufacturer
  if (topManufacturers.length > 0 && topManufacturers[0].count / total >= 0.5) {
    return 'Manufacturer Loyalist';
  }

  // Completionist: large collection (50+) with multiple full series sets
  if (total >= 50) {
    const seriesWithMany = topSeries.filter((s) => s.count >= 5).length;
    if (seriesWithMany >= 3) return 'Completionist';
  }

  // Cherry Picker: small collection (under 20) but high rarity
  if (total <= 20) {
    const rarityScore = calculateRarityScore(figures);
    if (rarityScore >= 60) return 'Cherry Picker';
  }

  // Default: Eclectic Collector (even distribution)
  return 'Eclectic Collector';
}

/**
 * Build a fun description paragraph for the collector archetype.
 */
export function buildArchetypeDescription(
  collectorType: string,
  totalFigures: number,
  topSeries: AffinityItem[],
  topManufacturers: AffinityItem[],
  diversityScore: number,
  loyaltyScore: number
): string {
  const topSeriesName = topSeries.length > 0 ? topSeries[0].name : 'various series';
  const topMfgName = topManufacturers.length > 0 ? topManufacturers[0].name : 'various makers';

  switch (collectorType) {
    case 'Scale Purist':
      return `With ${totalFigures} figures dominated by scale figures, you clearly appreciate the craftsmanship and detail that only scale figures deliver. Your collection from ${topMfgName} shows a refined taste for quality over quantity.`;

    case 'Nendoroid Army':
      return `Your army of ${totalFigures} figures is a Nendoroid paradise! With those adorable chibi faces staring back at you, your shelves must be the cutest display in the hobby. ${topSeriesName} seems to be your favorite universe to collect from.`;

    case 'Series Devotee':
      return `You are a true fan of ${topSeriesName}, with over half your collection of ${totalFigures} figures dedicated to it. When you love a series, you go all in.`;

    case 'Manufacturer Loyalist':
      return `With ${totalFigures} figures and a clear preference for ${topMfgName}, you trust their quality and keep coming back. Loyalty like yours is rare in the hobby.`;

    case 'Completionist':
      return `${totalFigures} figures across multiple deep series sets? You are a true completionist. When you start collecting a series, you do not stop until every character is on your shelf.`;

    case 'Cherry Picker':
      return `With a curated collection of ${totalFigures} figures, you are selective and intentional. Every piece earns its place on your shelf, and quality always wins over quantity.`;

    case 'Newcomer':
      return 'Your collection journey is just beginning! Every great collection starts with a single figure. Welcome to the hobby.';

    case 'Eclectic Collector':
    default:
      return `With ${totalFigures} figures spanning diverse series and manufacturers, your collection is a celebration of the entire hobby. A diversity score of ${diversityScore} shows you appreciate variety across the board.`;
  }
}

/**
 * Find the month with the most figure additions based on createdAt timestamps.
 */
export function findBiggestMonth(figures: Array<Record<string, any>>): { month: string; count: number } {
  if (figures.length === 0) return { month: 'N/A', count: 0 };

  const monthCounts = new Map<string, number>();
  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  for (const fig of figures) {
    const date = fig.createdAt ? new Date(fig.createdAt) : null;
    if (!date || isNaN(date.getTime())) continue;

    const key = `${monthNames[date.getMonth()]} ${date.getFullYear()}`;
    monthCounts.set(key, (monthCounts.get(key) || 0) + 1);
  }

  if (monthCounts.size === 0) return { month: 'N/A', count: 0 };

  let bestMonth = '';
  let bestCount = 0;
  for (const [month, count] of monthCounts) {
    if (count > bestCount) {
      bestMonth = month;
      bestCount = count;
    }
  }

  return { month: bestMonth, count: bestCount };
}

/**
 * Calculate average price and estimated total value from purchase info and releases.
 */
export function calculatePriceStats(figures: Array<Record<string, any>>): {
  averagePrice: number;
  estimatedValue: number;
} {
  let totalPrice = 0;
  let priceCount = 0;

  for (const fig of figures) {
    // Prefer user's purchase price
    if (fig.purchaseInfo?.price) {
      totalPrice += fig.purchaseInfo.price;
      priceCount++;
    } else if (fig.releases && fig.releases.length > 0) {
      // Fall back to first release price
      const releasePrice = fig.releases[0]?.price;
      if (releasePrice) {
        totalPrice += releasePrice;
        priceCount++;
      }
    }
  }

  const averagePrice = priceCount > 0 ? Math.round(totalPrice / priceCount) : 0;
  const estimatedValue = totalPrice;

  return { averagePrice, estimatedValue };
}

/**
 * Determine collection age string from the earliest figure's createdAt.
 */
export function getCollectionAge(figures: Array<Record<string, any>>): string {
  if (figures.length === 0) return 'No figures yet';

  let earliest: Date | null = null;
  for (const fig of figures) {
    const date = fig.createdAt ? new Date(fig.createdAt) : null;
    if (date && !isNaN(date.getTime())) {
      if (!earliest || date < earliest) {
        earliest = date;
      }
    }
  }

  if (!earliest) return 'Unknown';

  const monthNames = [
    'January', 'February', 'March', 'April', 'May', 'June',
    'July', 'August', 'September', 'October', 'November', 'December',
  ];

  return `Collecting since ${monthNames[earliest.getMonth()]} ${earliest.getFullYear()}`;
}

/**
 * Find the most collected character by checking figure names for common patterns.
 * Uses the `name` field to extract character names (first meaningful segment).
 */
export function findFavoriteCharacter(figures: Array<Record<string, any>>): string | undefined {
  if (figures.length === 0) return undefined;

  const characterCounts = new Map<string, number>();

  for (const fig of figures) {
    const name = fig.name || '';
    // Use the first word/segment as a rough character identifier
    // Many figure names start with character name: "Saber Alter", "Miku Hatsune", etc.
    const parts = name.split(/[\s\-:]+/);
    if (parts.length > 0 && parts[0].length > 1) {
      const charName = parts[0];
      characterCounts.set(charName, (characterCounts.get(charName) || 0) + 1);
    }
  }

  if (characterCounts.size === 0) return undefined;

  let bestChar = '';
  let bestCount = 0;
  for (const [char, count] of characterCounts) {
    if (count > bestCount) {
      bestChar = char;
      bestCount = count;
    }
  }

  // Only return if the character appears more than once
  return bestCount > 1 ? bestChar : undefined;
}

// --- Main Service ---

class CollectionDnaService {
  /**
   * Analyze a user's figure collection and produce a CollectionDna profile.
   */
  async analyze(userId: string): Promise<CollectionDna> {
    let userObjectId: mongoose.Types.ObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch {
      throw new Error('Invalid user identifier');
    }

    const figures = await Figure.find({
      userId: userObjectId,
      collectionStatus: { $in: ['owned', 'ordered', null] },
    }).lean();

    const total = figures.length;

    if (total === 0) {
      return this.emptyDna();
    }

    // Aggregate affinities
    const topSeries = aggregateByField(figures, (f) => f.origin, total, 10);
    const topManufacturers = aggregateByField(figures, (f) => f.manufacturer, total, 10);
    const topScales = aggregateByField(figures, (f) => f.scale, total, 10);
    const topCategories = aggregateByField(
      figures,
      (f) => f.category || f.type,
      total,
      10
    );

    // Use all unique manufacturers for diversity (not just top 10)
    const allManufacturers = aggregateByField(figures, (f) => f.manufacturer, total, 1000);

    // Scores
    const diversityScore = calculateDiversityScore(allManufacturers, total);
    const loyaltyScore = calculateLoyaltyScore(topManufacturers, total);
    const rarityScore = calculateRarityScore(figures);

    // Patterns
    const favoriteCharacter = findFavoriteCharacter(figures);
    const biggestMonth = findBiggestMonth(figures);
    const { averagePrice, estimatedValue } = calculatePriceStats(figures);
    const collectionAge = getCollectionAge(figures);

    // Collector type
    const collectorType = determineCollectorType(
      figures,
      topSeries,
      topManufacturers,
      topCategories,
      total
    );

    // Archetype description
    const archetypeDescription = buildArchetypeDescription(
      collectorType,
      total,
      topSeries,
      topManufacturers,
      diversityScore,
      loyaltyScore
    );

    return {
      collectorType,
      totalFigures: total,
      collectionAge,
      topSeries,
      topManufacturers,
      topScales,
      topCategories,
      rarityScore,
      diversityScore,
      loyaltyScore,
      favoriteCharacter,
      biggestMonth,
      averagePrice,
      estimatedValue,
      archetypeDescription,
    };
  }

  /**
   * Return an empty DNA profile for users with no figures.
   */
  private emptyDna(): CollectionDna {
    return {
      collectorType: 'Newcomer',
      totalFigures: 0,
      collectionAge: 'No figures yet',
      topSeries: [],
      topManufacturers: [],
      topScales: [],
      topCategories: [],
      rarityScore: 0,
      diversityScore: 0,
      loyaltyScore: 0,
      biggestMonth: { month: 'N/A', count: 0 },
      averagePrice: 0,
      estimatedValue: 0,
      archetypeDescription:
        'Your collection journey is just beginning! Every great collection starts with a single figure. Welcome to the hobby.',
    };
  }
}

export default new CollectionDnaService();
