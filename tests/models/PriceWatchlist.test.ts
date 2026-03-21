import mongoose from 'mongoose';
import PriceWatchlist, { PRICE_TRENDS } from '../../src/models/PriceWatchlist';
import User from '../../src/models/User';

describe('PriceWatchlist Model', () => {
  let testUserId: mongoose.Types.ObjectId;
  const validFigureId = new mongoose.Types.ObjectId();

  beforeEach(async () => {
    const testUser = new User({
      username: 'watchlistuser',
      email: 'watchlist@example.com',
      password: 'password123'
    });
    const saved = await testUser.save();
    testUserId = saved._id;
  });

  const getValidWatchlistData = () => ({
    userId: testUserId,
    figureId: validFigureId,
    trackedSites: ['akimomo', 'tom'],
    addedAt: new Date()
  });

  describe('Schema Validation', () => {
    it('should create a valid watchlist item with required fields', async () => {
      const item = new PriceWatchlist(getValidWatchlistData());
      const saved = await item.save();

      expect(saved._id).toBeDefined();
      expect(saved.userId).toEqual(testUserId);
      expect(saved.figureId).toEqual(validFigureId);
      expect(saved.trackedSites).toEqual(['akimomo', 'tom']);
      expect(saved.trend).toBe('unknown');
      expect(saved.lastKnownPrices).toEqual([]);
    });

    it('should require userId', async () => {
      const data = getValidWatchlistData();
      delete (data as any).userId;
      const item = new PriceWatchlist(data);
      await expect(item.save()).rejects.toThrow();
    });

    it('should require figureId', async () => {
      const data = getValidWatchlistData();
      delete (data as any).figureId;
      const item = new PriceWatchlist(data);
      await expect(item.save()).rejects.toThrow();
    });

    it('should reject invalid trackedSites values', async () => {
      const item = new PriceWatchlist({
        ...getValidWatchlistData(),
        trackedSites: ['invalid_site']
      });
      await expect(item.save()).rejects.toThrow();
    });

    it('should reject invalid trend values', async () => {
      const item = new PriceWatchlist({
        ...getValidWatchlistData(),
        trend: 'invalid_trend'
      });
      await expect(item.save()).rejects.toThrow();
    });

    it('should accept all valid trend values', async () => {
      for (const trend of PRICE_TRENDS) {
        // Use unique figureId for each to avoid unique index collision
        const figId = new mongoose.Types.ObjectId();
        const item = new PriceWatchlist({
          ...getValidWatchlistData(),
          figureId: figId,
          trend
        });
        const saved = await item.save();
        expect(saved.trend).toBe(trend);
      }
    });

    it('should enforce unique userId + figureId combination', async () => {
      await PriceWatchlist.create(getValidWatchlistData());

      const duplicate = new PriceWatchlist(getValidWatchlistData());
      await expect(duplicate.save()).rejects.toThrow();
    });
  });

  describe('Defaults', () => {
    it('should default trend to unknown', async () => {
      const item = new PriceWatchlist(getValidWatchlistData());
      const saved = await item.save();
      expect(saved.trend).toBe('unknown');
    });

    it('should default lastKnownPrices to empty array', async () => {
      const item = new PriceWatchlist(getValidWatchlistData());
      const saved = await item.save();
      expect(saved.lastKnownPrices).toEqual([]);
    });

    it('should default trackedSites to empty array when not provided', async () => {
      const data = getValidWatchlistData();
      delete (data as any).trackedSites;
      const item = new PriceWatchlist(data);
      const saved = await item.save();
      expect(saved.trackedSites).toEqual([]);
    });
  });

  describe('Subdocuments', () => {
    it('should accept lastKnownPrices array', async () => {
      const item = new PriceWatchlist({
        ...getValidWatchlistData(),
        lastKnownPrices: [
          {
            site: 'akimomo',
            price: 15000,
            currency: 'JPY',
            priceUsd: 100,
            stockStatus: 'in_stock',
            observedAt: new Date()
          }
        ]
      });
      const saved = await item.save();
      expect(saved.lastKnownPrices).toHaveLength(1);
      expect(saved.lastKnownPrices[0].site).toBe('akimomo');
      expect(saved.lastKnownPrices[0].price).toBe(15000);
    });

    it('should accept lowestPrice subdocument', async () => {
      const item = new PriceWatchlist({
        ...getValidWatchlistData(),
        lowestPrice: {
          amount: 80,
          currency: 'USD',
          site: 'akimomo',
          date: new Date('2024-01-15')
        }
      });
      const saved = await item.save();
      expect(saved.lowestPrice).toBeDefined();
      expect(saved.lowestPrice!.amount).toBe(80);
      expect(saved.lowestPrice!.site).toBe('akimomo');
    });

    it('should accept highestPrice subdocument', async () => {
      const item = new PriceWatchlist({
        ...getValidWatchlistData(),
        highestPrice: {
          amount: 200,
          currency: 'USD',
          site: 'tom',
          date: new Date('2024-03-01')
        }
      });
      const saved = await item.save();
      expect(saved.highestPrice).toBeDefined();
      expect(saved.highestPrice!.amount).toBe(200);
      expect(saved.highestPrice!.site).toBe('tom');
    });
  });

  describe('Queries', () => {
    it('should find watchlist items by userId', async () => {
      await PriceWatchlist.create(getValidWatchlistData());

      const items = await PriceWatchlist.find({ userId: testUserId });
      expect(items).toHaveLength(1);
    });

    it('should sort by addedAt descending', async () => {
      const figId1 = new mongoose.Types.ObjectId();
      const figId2 = new mongoose.Types.ObjectId();

      await PriceWatchlist.create({
        ...getValidWatchlistData(),
        figureId: figId1,
        addedAt: new Date('2024-01-01')
      });
      await PriceWatchlist.create({
        ...getValidWatchlistData(),
        figureId: figId2,
        addedAt: new Date('2024-06-01')
      });

      const items = await PriceWatchlist.find({ userId: testUserId }).sort({ addedAt: -1 });
      expect(items).toHaveLength(2);
      expect(items[0].addedAt.getTime()).toBeGreaterThan(items[1].addedAt.getTime());
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt automatically', async () => {
      const item = new PriceWatchlist(getValidWatchlistData());
      const saved = await item.save();

      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });
  });
});
