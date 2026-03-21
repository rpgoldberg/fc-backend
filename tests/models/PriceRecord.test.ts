import mongoose from 'mongoose';
import PriceRecord, { PRICE_SITES, STOCK_STATUSES } from '../../src/models/PriceRecord';

describe('PriceRecord Model', () => {
  const validFigureId = new mongoose.Types.ObjectId();

  const validRecordData = {
    figureId: validFigureId,
    site: 'akimomo' as const,
    sourceUrl: 'https://akimomo.com/product/12345',
    price: 15000,
    currency: 'JPY',
    priceUsd: 100.50,
    stockStatus: 'in_stock' as const,
    observedAt: new Date()
  };

  describe('Schema Validation', () => {
    it('should create a valid price record with required fields', async () => {
      const record = new PriceRecord(validRecordData);
      const saved = await record.save();

      expect(saved._id).toBeDefined();
      expect(saved.figureId).toEqual(validFigureId);
      expect(saved.site).toBe('akimomo');
      expect(saved.sourceUrl).toBe('https://akimomo.com/product/12345');
      expect(saved.price).toBe(15000);
      expect(saved.currency).toBe('JPY');
      expect(saved.priceUsd).toBe(100.50);
      expect(saved.stockStatus).toBe('in_stock');
      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
    });

    it('should require figureId', async () => {
      const data = { ...validRecordData };
      delete (data as any).figureId;
      const record = new PriceRecord(data);
      await expect(record.save()).rejects.toThrow();
    });

    it('should require site', async () => {
      const data = { ...validRecordData };
      delete (data as any).site;
      const record = new PriceRecord(data);
      await expect(record.save()).rejects.toThrow();
    });

    it('should require sourceUrl', async () => {
      const data = { ...validRecordData };
      delete (data as any).sourceUrl;
      const record = new PriceRecord(data);
      await expect(record.save()).rejects.toThrow();
    });

    it('should require price', async () => {
      const data = { ...validRecordData };
      delete (data as any).price;
      const record = new PriceRecord(data);
      await expect(record.save()).rejects.toThrow();
    });

    it('should require currency', async () => {
      const data = { ...validRecordData };
      delete (data as any).currency;
      const record = new PriceRecord(data);
      await expect(record.save()).rejects.toThrow();
    });

    it('should require priceUsd', async () => {
      const data = { ...validRecordData };
      delete (data as any).priceUsd;
      const record = new PriceRecord(data);
      await expect(record.save()).rejects.toThrow();
    });

    it('should reject invalid site values', async () => {
      const record = new PriceRecord({
        ...validRecordData,
        site: 'invalidsite'
      });
      await expect(record.save()).rejects.toThrow();
    });

    it('should reject invalid stockStatus values', async () => {
      const record = new PriceRecord({
        ...validRecordData,
        stockStatus: 'invalid_status'
      });
      await expect(record.save()).rejects.toThrow();
    });

    it('should accept all valid site values', async () => {
      for (const site of PRICE_SITES) {
        const record = new PriceRecord({
          ...validRecordData,
          site
        });
        const saved = await record.save();
        expect(saved.site).toBe(site);
      }
    });

    it('should accept all valid stockStatus values', async () => {
      for (const status of STOCK_STATUSES) {
        const record = new PriceRecord({
          ...validRecordData,
          stockStatus: status
        });
        const saved = await record.save();
        expect(saved.stockStatus).toBe(status);
      }
    });

    it('should default stockStatus to unknown', async () => {
      const data = { ...validRecordData };
      delete (data as any).stockStatus;
      const record = new PriceRecord(data);
      const saved = await record.save();
      expect(saved.stockStatus).toBe('unknown');
    });

    it('should default isResale to false', async () => {
      const record = new PriceRecord(validRecordData);
      const saved = await record.save();
      expect(saved.isResale).toBe(false);
    });

    it('should default observedAt to current date', async () => {
      const data = { ...validRecordData };
      delete (data as any).observedAt;
      const before = new Date();
      const record = new PriceRecord(data);
      const saved = await record.save();
      const after = new Date();
      expect(saved.observedAt.getTime()).toBeGreaterThanOrEqual(before.getTime());
      expect(saved.observedAt.getTime()).toBeLessThanOrEqual(after.getTime());
    });
  });

  describe('Optional Fields', () => {
    it('should accept shipping information', async () => {
      const record = new PriceRecord({
        ...validRecordData,
        shippingCost: 500,
        shippingCurrency: 'JPY'
      });
      const saved = await record.save();
      expect(saved.shippingCost).toBe(500);
      expect(saved.shippingCurrency).toBe('JPY');
    });

    it('should accept resale flag', async () => {
      const record = new PriceRecord({
        ...validRecordData,
        isResale: true
      });
      const saved = await record.save();
      expect(saved.isResale).toBe(true);
    });

    it('should accept scrapeSessionId', async () => {
      const record = new PriceRecord({
        ...validRecordData,
        scrapeSessionId: 'session-abc-123'
      });
      const saved = await record.save();
      expect(saved.scrapeSessionId).toBe('session-abc-123');
    });

    it('should accept metadata', async () => {
      const record = new PriceRecord({
        ...validRecordData,
        metadata: { condition: 'new', seller: 'official' }
      });
      const saved = await record.save();
      expect(saved.metadata).toEqual({ condition: 'new', seller: 'official' });
    });
  });

  describe('Queries', () => {
    beforeEach(async () => {
      const figureId1 = new mongoose.Types.ObjectId();
      const figureId2 = new mongoose.Types.ObjectId();

      await PriceRecord.insertMany([
        { ...validRecordData, figureId: figureId1, site: 'akimomo', priceUsd: 100, observedAt: new Date('2024-01-01') },
        { ...validRecordData, figureId: figureId1, site: 'akimomo', priceUsd: 95, observedAt: new Date('2024-02-01') },
        { ...validRecordData, figureId: figureId1, site: 'tom', priceUsd: 110, observedAt: new Date('2024-01-15') },
        { ...validRecordData, figureId: figureId2, site: 'mfc', priceUsd: 200, observedAt: new Date('2024-01-01') }
      ]);
    });

    it('should find records by site', async () => {
      const records = await PriceRecord.find({ site: 'akimomo' });
      expect(records).toHaveLength(2);
    });

    it('should find records by stockStatus', async () => {
      const records = await PriceRecord.find({ stockStatus: 'in_stock' });
      expect(records).toHaveLength(4);
    });

    it('should sort by observedAt descending', async () => {
      const records = await PriceRecord.find({}).sort({ observedAt: -1 });
      expect(records).toHaveLength(4);
      // Most recent first
      expect(records[0].observedAt.getTime()).toBeGreaterThanOrEqual(records[1].observedAt.getTime());
    });

    it('should support priceUsd range queries', async () => {
      const records = await PriceRecord.find({ priceUsd: { $lte: 100 } });
      expect(records).toHaveLength(2);
    });
  });

  describe('Timestamps', () => {
    it('should set createdAt and updatedAt automatically', async () => {
      const record = new PriceRecord(validRecordData);
      const saved = await record.save();

      expect(saved.createdAt).toBeDefined();
      expect(saved.updatedAt).toBeDefined();
      expect(saved.createdAt).toBeInstanceOf(Date);
      expect(saved.updatedAt).toBeInstanceOf(Date);
    });
  });
});
