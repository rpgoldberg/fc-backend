import mongoose from 'mongoose';
import Figure from '../../src/models/Figure';
import User from '../../src/models/User';
import collectionDnaService, {
  aggregateByField,
  calculateDiversityScore,
  calculateLoyaltyScore,
  calculateRarityScore,
  determineCollectorType,
  buildArchetypeDescription,
  findBiggestMonth,
  calculatePriceStats,
  getCollectionAge,
  findFavoriteCharacter,
  AffinityItem,
} from '../../src/services/collectionDnaService';

// testSetup.ts provides beforeAll/afterAll/beforeEach hooks (mongo memory server)

const userId = new mongoose.Types.ObjectId();

/** Helper to create a figure document in the database. */
async function createFigure(overrides: Record<string, any> = {}) {
  return Figure.create({
    name: 'Test Figure',
    manufacturer: 'Good Smile Company',
    userId,
    collectionStatus: 'owned',
    ...overrides,
  });
}

// ─── Pure Function Unit Tests ────────────────────────────────────────

describe('aggregateByField', () => {
  it('should aggregate and sort by count descending', () => {
    const figures = [
      { origin: 'Fate' },
      { origin: 'Fate' },
      { origin: 'Fate' },
      { origin: 'Vocaloid' },
      { origin: 'Vocaloid' },
      { origin: 'One Piece' },
    ];

    const result = aggregateByField(figures, (f) => f.origin, 6, 5);

    expect(result).toHaveLength(3);
    expect(result[0].name).toBe('Fate');
    expect(result[0].count).toBe(3);
    expect(result[0].percentage).toBe(50);
    expect(result[1].name).toBe('Vocaloid');
    expect(result[1].count).toBe(2);
    expect(result[2].name).toBe('One Piece');
    expect(result[2].count).toBe(1);
  });

  it('should skip null/undefined values', () => {
    const figures = [
      { origin: 'Fate' },
      { origin: null },
      { origin: undefined },
      {},
    ];

    const result = aggregateByField(figures, (f) => f.origin, 4, 5);

    expect(result).toHaveLength(1);
    expect(result[0].name).toBe('Fate');
  });

  it('should respect the limit parameter', () => {
    const figures = [
      { origin: 'A' },
      { origin: 'B' },
      { origin: 'C' },
      { origin: 'D' },
    ];

    const result = aggregateByField(figures, (f) => f.origin, 4, 2);

    expect(result).toHaveLength(2);
  });

  it('should group case-insensitively but preserve display name', () => {
    const figures = [
      { manufacturer: 'Good Smile Company' },
      { manufacturer: 'good smile company' },
      { manufacturer: 'GOOD SMILE COMPANY' },
    ];

    const result = aggregateByField(figures, (f) => f.manufacturer, 3, 5);

    expect(result).toHaveLength(1);
    expect(result[0].count).toBe(3);
    // First-seen display name preserved
    expect(result[0].name).toBe('Good Smile Company');
  });

  it('should return empty array when total is 0', () => {
    const result = aggregateByField([], (f) => f.origin, 0, 5);
    expect(result).toEqual([]);
  });
});

describe('calculateDiversityScore', () => {
  it('should return 0 for empty items', () => {
    expect(calculateDiversityScore([], 0)).toBe(0);
  });

  it('should return 0 for a single category', () => {
    const items: AffinityItem[] = [{ name: 'Scale', count: 10, percentage: 100 }];
    expect(calculateDiversityScore(items, 10)).toBe(0);
  });

  it('should return 100 for perfectly even distribution', () => {
    const items: AffinityItem[] = [
      { name: 'A', count: 25, percentage: 25 },
      { name: 'B', count: 25, percentage: 25 },
      { name: 'C', count: 25, percentage: 25 },
      { name: 'D', count: 25, percentage: 25 },
    ];
    expect(calculateDiversityScore(items, 100)).toBe(100);
  });

  it('should return moderate score for uneven distribution', () => {
    const items: AffinityItem[] = [
      { name: 'A', count: 80, percentage: 80 },
      { name: 'B', count: 10, percentage: 10 },
      { name: 'C', count: 10, percentage: 10 },
    ];
    const score = calculateDiversityScore(items, 100);
    expect(score).toBeGreaterThan(0);
    expect(score).toBeLessThan(100);
  });
});

describe('calculateLoyaltyScore', () => {
  it('should return 0 for empty manufacturers', () => {
    expect(calculateLoyaltyScore([], 0)).toBe(0);
  });

  it('should return 100 when all from one manufacturer', () => {
    const items: AffinityItem[] = [{ name: 'GSC', count: 50, percentage: 100 }];
    expect(calculateLoyaltyScore(items, 50)).toBe(100);
  });

  it('should return proportional score', () => {
    const items: AffinityItem[] = [
      { name: 'GSC', count: 30, percentage: 60 },
      { name: 'Alter', count: 20, percentage: 40 },
    ];
    expect(calculateLoyaltyScore(items, 50)).toBe(60);
  });
});

describe('calculateRarityScore', () => {
  it('should return 0 for empty collection', () => {
    expect(calculateRarityScore([])).toBe(0);
  });

  it('should score scale figures higher than prize figures', () => {
    const scaleFigures = [
      { category: 'Scale Figure' },
      { category: 'Scale Figure' },
    ];
    const prizeFigures = [
      { category: 'Prize Figure' },
      { category: 'Prize Figure' },
    ];

    const scaleScore = calculateRarityScore(scaleFigures);
    const prizeScore = calculateRarityScore(prizeFigures);

    expect(scaleScore).toBeGreaterThan(prizeScore);
  });

  it('should give bonus for purchase info', () => {
    const withPrice = [
      { category: 'Scale Figure', purchaseInfo: { price: 15000 } },
    ];
    const withoutPrice = [{ category: 'Scale Figure' }];

    const withPriceScore = calculateRarityScore(withPrice);
    const withoutPriceScore = calculateRarityScore(withoutPrice);

    expect(withPriceScore).toBeGreaterThan(withoutPriceScore);
  });

  it('should handle unknown categories with default weight', () => {
    const figures = [{ category: 'Something Unknown' }];
    const score = calculateRarityScore(figures);
    expect(score).toBe(30); // default weight 0.3 * 100
  });
});

describe('determineCollectorType', () => {
  it('should return Newcomer for empty collection', () => {
    expect(determineCollectorType([], [], [], [], 0)).toBe('Newcomer');
  });

  it('should return Scale Purist when 70%+ are scale figures', () => {
    const figures = [
      { category: 'Scale Figure' },
      { category: 'Scale Figure' },
      { category: 'Scale Figure' },
      { category: 'Scale Figure' },
      { category: 'Scale Figure' },
      { category: 'Scale Figure' },
      { category: 'Scale Figure' },
      { category: 'Nendoroid' },
      { category: 'Figma' },
      { category: 'Prize Figure' },
    ];
    const result = determineCollectorType(figures, [], [], [], 10);
    expect(result).toBe('Scale Purist');
  });

  it('should return Nendoroid Army when 70%+ are Nendoroids', () => {
    const figures = [
      { category: 'Nendoroid' },
      { category: 'Nendoroid' },
      { category: 'Nendoroid' },
      { category: 'Nendoroid' },
      { category: 'Nendoroid' },
      { category: 'Nendoroid' },
      { category: 'Nendoroid' },
      { category: 'Scale Figure' },
      { category: 'Figma' },
      { category: 'Prize Figure' },
    ];
    const result = determineCollectorType(figures, [], [], [], 10);
    expect(result).toBe('Nendoroid Army');
  });

  it('should return Series Devotee when 50%+ from one series', () => {
    const figures = Array.from({ length: 10 }, () => ({ category: 'Mixed' }));
    const topSeries: AffinityItem[] = [
      { name: 'Fate', count: 6, percentage: 60 },
    ];
    const result = determineCollectorType(figures, topSeries, [], [], 10);
    expect(result).toBe('Series Devotee');
  });

  it('should return Manufacturer Loyalist when 50%+ from one manufacturer', () => {
    const figures = Array.from({ length: 10 }, () => ({ category: 'Mixed' }));
    const topManufacturers: AffinityItem[] = [
      { name: 'Good Smile Company', count: 6, percentage: 60 },
    ];
    const result = determineCollectorType(figures, [], topManufacturers, [], 10);
    expect(result).toBe('Manufacturer Loyalist');
  });

  it('should return Completionist for large collection with deep series sets', () => {
    // 60 figures across 4 series, each with 15 figures
    const figures = Array.from({ length: 60 }, (_, i) => ({
      category: `Type${i % 5}`,
    }));
    const topSeries: AffinityItem[] = [
      { name: 'Fate', count: 15, percentage: 25 },
      { name: 'Vocaloid', count: 15, percentage: 25 },
      { name: 'One Piece', count: 15, percentage: 25 },
      { name: 'Evangelion', count: 15, percentage: 25 },
    ];
    const topManufacturers: AffinityItem[] = [
      { name: 'GSC', count: 20, percentage: 33.3 },
      { name: 'Alter', count: 20, percentage: 33.3 },
      { name: 'Bandai', count: 20, percentage: 33.3 },
    ];
    const result = determineCollectorType(figures, topSeries, topManufacturers, [], 60);
    expect(result).toBe('Completionist');
  });

  it('should return Cherry Picker for small high-rarity collection', () => {
    // Small collection of 5 mixed high-value figures with purchase info (high rarity)
    // Mix categories to avoid triggering Scale Purist (70%+ threshold)
    const figures = [
      { category: 'Scale Figure', purchaseInfo: { price: 20000 } },
      { category: 'Scale Figure', purchaseInfo: { price: 25000 } },
      { category: 'Scale Figure', purchaseInfo: { price: 18000 } },
      { category: 'Garage Kit', purchaseInfo: { price: 30000 } },
      { category: 'Doll', purchaseInfo: { price: 15000 } },
    ];
    const topSeries: AffinityItem[] = [
      { name: 'A', count: 2, percentage: 40 },
      { name: 'B', count: 2, percentage: 40 },
      { name: 'C', count: 1, percentage: 20 },
    ];
    const topManufacturers: AffinityItem[] = [
      { name: 'GSC', count: 2, percentage: 40 },
      { name: 'Alter', count: 2, percentage: 40 },
      { name: 'Max', count: 1, percentage: 20 },
    ];
    const result = determineCollectorType(figures, topSeries, topManufacturers, [], 5);
    expect(result).toBe('Cherry Picker');
  });

  it('should return Eclectic Collector for evenly distributed collections', () => {
    const figures = Array.from({ length: 30 }, (_, i) => ({
      category: `Type${i % 5}`,
    }));
    const topSeries: AffinityItem[] = [
      { name: 'A', count: 8, percentage: 26.7 },
      { name: 'B', count: 7, percentage: 23.3 },
    ];
    const topManufacturers: AffinityItem[] = [
      { name: 'GSC', count: 10, percentage: 33.3 },
    ];
    const result = determineCollectorType(figures, topSeries, topManufacturers, [], 30);
    expect(result).toBe('Eclectic Collector');
  });
});

describe('buildArchetypeDescription', () => {
  it('should return a description for each archetype', () => {
    const types = [
      'Scale Purist',
      'Nendoroid Army',
      'Series Devotee',
      'Manufacturer Loyalist',
      'Completionist',
      'Cherry Picker',
      'Newcomer',
      'Eclectic Collector',
    ];

    for (const type of types) {
      const desc = buildArchetypeDescription(
        type,
        25,
        [{ name: 'Fate', count: 10, percentage: 40 }],
        [{ name: 'GSC', count: 15, percentage: 60 }],
        65,
        60
      );
      expect(desc).toBeTruthy();
      expect(typeof desc).toBe('string');
      expect(desc.length).toBeGreaterThan(10);
    }
  });

  it('should include total figures count in description', () => {
    const desc = buildArchetypeDescription(
      'Scale Purist',
      42,
      [{ name: 'Fate', count: 30, percentage: 71 }],
      [{ name: 'Alter', count: 25, percentage: 60 }],
      30,
      60
    );
    expect(desc).toContain('42');
  });
});

describe('findBiggestMonth', () => {
  it('should return N/A for empty collection', () => {
    const result = findBiggestMonth([]);
    expect(result).toEqual({ month: 'N/A', count: 0 });
  });

  it('should find the correct biggest month', () => {
    const figures = [
      { createdAt: new Date('2024-03-15') },
      { createdAt: new Date('2024-03-20') },
      { createdAt: new Date('2024-03-25') },
      { createdAt: new Date('2024-01-10') },
      { createdAt: new Date('2024-06-01') },
    ];

    const result = findBiggestMonth(figures);
    expect(result.month).toBe('March 2024');
    expect(result.count).toBe(3);
  });

  it('should handle figures without createdAt', () => {
    const figures = [
      { createdAt: new Date('2024-01-10') },
      {},
      { createdAt: null },
    ];

    const result = findBiggestMonth(figures);
    expect(result.month).toBe('January 2024');
    expect(result.count).toBe(1);
  });
});

describe('calculatePriceStats', () => {
  it('should return zeros for empty collection', () => {
    const result = calculatePriceStats([]);
    expect(result.averagePrice).toBe(0);
    expect(result.estimatedValue).toBe(0);
  });

  it('should prefer purchaseInfo price over release price', () => {
    const figures = [
      {
        purchaseInfo: { price: 10000 },
        releases: [{ price: 15000 }],
      },
    ];

    const result = calculatePriceStats(figures);
    expect(result.averagePrice).toBe(10000);
    expect(result.estimatedValue).toBe(10000);
  });

  it('should fall back to release price when no purchase info', () => {
    const figures = [
      { releases: [{ price: 12000 }] },
    ];

    const result = calculatePriceStats(figures);
    expect(result.averagePrice).toBe(12000);
    expect(result.estimatedValue).toBe(12000);
  });

  it('should calculate correct average across multiple figures', () => {
    const figures = [
      { purchaseInfo: { price: 10000 } },
      { purchaseInfo: { price: 20000 } },
      { purchaseInfo: { price: 30000 } },
    ];

    const result = calculatePriceStats(figures);
    expect(result.averagePrice).toBe(20000);
    expect(result.estimatedValue).toBe(60000);
  });
});

describe('getCollectionAge', () => {
  it('should return "No figures yet" for empty collection', () => {
    expect(getCollectionAge([])).toBe('No figures yet');
  });

  it('should return earliest date formatted correctly', () => {
    const figures = [
      { createdAt: new Date('2025-06-15') },
      { createdAt: new Date('2024-01-10') },
      { createdAt: new Date('2025-03-20') },
    ];

    expect(getCollectionAge(figures)).toBe('Collecting since January 2024');
  });

  it('should handle figures without valid dates', () => {
    const figures = [
      {},
      { createdAt: null },
    ];

    expect(getCollectionAge(figures)).toBe('Unknown');
  });
});

describe('findFavoriteCharacter', () => {
  it('should return undefined for empty collection', () => {
    expect(findFavoriteCharacter([])).toBeUndefined();
  });

  it('should find the most common character name prefix', () => {
    const figures = [
      { name: 'Saber Alter' },
      { name: 'Saber Lily' },
      { name: 'Saber Triumphant Excalibur' },
      { name: 'Miku Hatsune' },
    ];

    expect(findFavoriteCharacter(figures)).toBe('Saber');
  });

  it('should return undefined when no character appears more than once', () => {
    const figures = [
      { name: 'Saber Alter' },
      { name: 'Miku Hatsune' },
      { name: 'Rem' },
    ];

    expect(findFavoriteCharacter(figures)).toBeUndefined();
  });
});

// ─── Integration Tests (MongoDB) ─────────────────────────────────────

describe('CollectionDnaService.analyze (integration)', () => {
  let testUserId: string;

  beforeEach(async () => {
    const user = await User.create({
      username: 'dna_test_user',
      email: 'dna@test.com',
      password: 'password123',
    });
    testUserId = user._id.toString();
  });

  it('should return Newcomer DNA for user with no figures', async () => {
    const dna = await collectionDnaService.analyze(testUserId);

    expect(dna.collectorType).toBe('Newcomer');
    expect(dna.totalFigures).toBe(0);
    expect(dna.collectionAge).toBe('No figures yet');
    expect(dna.topSeries).toEqual([]);
    expect(dna.topManufacturers).toEqual([]);
    expect(dna.topScales).toEqual([]);
    expect(dna.topCategories).toEqual([]);
    expect(dna.rarityScore).toBe(0);
    expect(dna.diversityScore).toBe(0);
    expect(dna.loyaltyScore).toBe(0);
    expect(dna.averagePrice).toBe(0);
    expect(dna.estimatedValue).toBe(0);
    expect(dna.biggestMonth).toEqual({ month: 'N/A', count: 0 });
    expect(dna.archetypeDescription).toContain('just beginning');
  });

  it('should correctly identify a Scale Purist', async () => {
    const userOid = new mongoose.Types.ObjectId(testUserId);

    // Create 8 scale figures and 2 others
    for (let i = 0; i < 8; i++) {
      await Figure.create({
        name: `Scale Figure ${i}`,
        manufacturer: 'Alter',
        userId: userOid,
        collectionStatus: 'owned',
        category: 'Scale Figure',
        scale: '1/7',
        origin: 'Fate',
      });
    }
    await Figure.create({
      name: 'Nendoroid 1',
      manufacturer: 'GSC',
      userId: userOid,
      collectionStatus: 'owned',
      category: 'Nendoroid',
      origin: 'Vocaloid',
    });
    await Figure.create({
      name: 'Figma 1',
      manufacturer: 'Max Factory',
      userId: userOid,
      collectionStatus: 'owned',
      category: 'Figma',
      origin: 'Attack on Titan',
    });

    const dna = await collectionDnaService.analyze(testUserId);

    expect(dna.collectorType).toBe('Scale Purist');
    expect(dna.totalFigures).toBe(10);
    expect(dna.topManufacturers[0].name).toBe('Alter');
    expect(dna.topSeries[0].name).toBe('Fate');
    expect(dna.archetypeDescription).toContain('scale figures');
  });

  it('should correctly aggregate top series and manufacturers', async () => {
    const userOid = new mongoose.Types.ObjectId(testUserId);

    await Figure.create({
      name: 'Fig 1', manufacturer: 'GSC', userId: userOid,
      collectionStatus: 'owned', origin: 'Fate', category: 'Scale Figure',
    });
    await Figure.create({
      name: 'Fig 2', manufacturer: 'GSC', userId: userOid,
      collectionStatus: 'owned', origin: 'Fate', category: 'Scale Figure',
    });
    await Figure.create({
      name: 'Fig 3', manufacturer: 'Alter', userId: userOid,
      collectionStatus: 'owned', origin: 'Vocaloid', category: 'Nendoroid',
    });

    const dna = await collectionDnaService.analyze(testUserId);

    expect(dna.topSeries).toHaveLength(2);
    expect(dna.topSeries[0].name).toBe('Fate');
    expect(dna.topSeries[0].count).toBe(2);
    expect(dna.topSeries[0].percentage).toBeCloseTo(66.7, 0);

    expect(dna.topManufacturers).toHaveLength(2);
    expect(dna.topManufacturers[0].name).toBe('GSC');
    expect(dna.topManufacturers[0].count).toBe(2);
  });

  it('should exclude wished figures from DNA analysis', async () => {
    const userOid = new mongoose.Types.ObjectId(testUserId);

    await Figure.create({
      name: 'Owned Fig',
      manufacturer: 'GSC',
      userId: userOid,
      collectionStatus: 'owned',
      origin: 'Fate',
    });
    await Figure.create({
      name: 'Wished Fig',
      manufacturer: 'Alter',
      userId: userOid,
      collectionStatus: 'wished',
      origin: 'Vocaloid',
    });

    const dna = await collectionDnaService.analyze(testUserId);

    expect(dna.totalFigures).toBe(1);
    expect(dna.topManufacturers).toHaveLength(1);
    expect(dna.topManufacturers[0].name).toBe('GSC');
  });

  it('should calculate price stats from purchase info', async () => {
    const userOid = new mongoose.Types.ObjectId(testUserId);

    await Figure.create({
      name: 'Fig 1',
      manufacturer: 'GSC',
      userId: userOid,
      collectionStatus: 'owned',
      purchaseInfo: { price: 10000, currency: 'JPY' },
    });
    await Figure.create({
      name: 'Fig 2',
      manufacturer: 'Alter',
      userId: userOid,
      collectionStatus: 'owned',
      purchaseInfo: { price: 20000, currency: 'JPY' },
    });

    const dna = await collectionDnaService.analyze(testUserId);

    expect(dna.averagePrice).toBe(15000);
    expect(dna.estimatedValue).toBe(30000);
  });

  it('should throw for invalid user ID', async () => {
    await expect(collectionDnaService.analyze('not-an-objectid')).rejects.toThrow(
      'Invalid user identifier'
    );
  });

  it('should not include figures from other users', async () => {
    const userOid = new mongoose.Types.ObjectId(testUserId);
    const otherUserId = new mongoose.Types.ObjectId();

    await Figure.create({
      name: 'My Fig',
      manufacturer: 'GSC',
      userId: userOid,
      collectionStatus: 'owned',
    });
    await Figure.create({
      name: 'Other Fig',
      manufacturer: 'Alter',
      userId: otherUserId,
      collectionStatus: 'owned',
    });

    const dna = await collectionDnaService.analyze(testUserId);

    expect(dna.totalFigures).toBe(1);
    expect(dna.topManufacturers).toHaveLength(1);
    expect(dna.topManufacturers[0].name).toBe('GSC');
  });

  it('should include ordered figures in DNA analysis', async () => {
    const userOid = new mongoose.Types.ObjectId(testUserId);

    await Figure.create({
      name: 'Owned Fig',
      manufacturer: 'GSC',
      userId: userOid,
      collectionStatus: 'owned',
    });
    await Figure.create({
      name: 'Ordered Fig',
      manufacturer: 'Alter',
      userId: userOid,
      collectionStatus: 'ordered',
    });

    const dna = await collectionDnaService.analyze(testUserId);

    expect(dna.totalFigures).toBe(2);
  });
});
