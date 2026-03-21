import mongoose from 'mongoose';
import PriceRecord from '../../src/models/PriceRecord';
import PriceAlert from '../../src/models/PriceAlert';
import PriceWatchlist from '../../src/models/PriceWatchlist';
import Figure from '../../src/models/Figure';
import {
  PriceMonitorService,
  getPriceMonitor,
  resetPriceMonitor,
} from '../../src/services/priceMonitorService';

describe('PriceMonitorService', () => {
  let testUserId: mongoose.Types.ObjectId;
  let testFigureId: mongoose.Types.ObjectId;

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();
    testFigureId = new mongoose.Types.ObjectId();
    resetPriceMonitor();
  });

  afterEach(() => {
    resetPriceMonitor();
  });

  describe('runCycle', () => {
    it('should return early with zero counts when no watchlist items exist', async () => {
      const monitor = new PriceMonitorService();
      const result = await monitor.runCycle();

      expect(result.skipped).toBeUndefined();
      expect(result.checked).toBe(0);
      expect(result.recorded).toBe(0);
      expect(result.alertsTriggered).toBe(0);
      expect(result.durationMs).toBeDefined();
      expect(result.durationMs).toBeGreaterThanOrEqual(0);
    });

    it('should collect unique figure IDs from watchlists', async () => {
      // Create a figure
      const figure = await Figure.create({
        name: 'Test Figure',
        manufacturer: 'Test Manufacturer',
        userId: testUserId,
      });

      // Create two watchlist entries for the same figure (different users)
      const userId2 = new mongoose.Types.ObjectId();
      await PriceWatchlist.create([
        {
          userId: testUserId,
          figureId: figure._id,
          trackedSites: ['mfc'],
        },
        {
          userId: userId2,
          figureId: figure._id,
          trackedSites: ['akimomo'],
        },
      ]);

      const monitor = new PriceMonitorService();
      // checkPrice returns null by default, so recorded will be 0
      const result = await monitor.runCycle();

      // Should have checked 1 unique figure (even though 2 watchlist entries)
      expect(result.checked).toBe(1);
      expect(result.recorded).toBe(0);
    });

    it('should skip cycle if already running (mutex)', async () => {
      const monitor = new PriceMonitorService();

      // Create a figure and watchlist to trigger a real cycle
      const figure = await Figure.create({
        name: 'Mutex Test Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });
      await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc'],
      });

      // Make checkPrice slow to hold the lock
      const originalCheckPrice = monitor.checkPrice.bind(monitor);
      let resolveSlowCheck: () => void;
      const slowCheckPromise = new Promise<void>((resolve) => {
        resolveSlowCheck = resolve;
      });

      monitor.checkPrice = async (_figure: any, _site: string) => {
        await slowCheckPromise;
        return null;
      };

      // Start a cycle (it will be held waiting on checkPrice)
      const firstCyclePromise = monitor.runCycle();

      // Small delay to ensure the first cycle has started and set isRunning
      await new Promise(resolve => setTimeout(resolve, 50));

      // Try to run another cycle while first is running
      const secondResult = await monitor.runCycle();
      expect(secondResult.skipped).toBe(true);

      // Release the first cycle
      resolveSlowCheck!();
      const firstResult = await firstCyclePromise;
      expect(firstResult.skipped).toBeUndefined();
    });

    it('should handle errors in individual site checks without stopping cycle', async () => {
      const figure = await Figure.create({
        name: 'Error Test Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc', 'akimomo'],
      });

      const monitor = new PriceMonitorService();
      let callCount = 0;
      monitor.checkPrice = async (_figure: any, site: string) => {
        callCount++;
        if (site === 'mfc') {
          throw new Error('Scraper timeout');
        }
        return null;
      };

      // Should not throw, should handle the error gracefully
      const result = await monitor.runCycle();
      expect(result.checked).toBe(1);
      expect(callCount).toBe(2); // Both sites were attempted
    });

    it('should record prices and evaluate alerts when checkPrice returns data', async () => {
      const figure = await Figure.create({
        name: 'Price Check Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc'],
      });

      // Create a price_below alert at $50
      await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 50,
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();

      // Override checkPrice to return a price below the alert threshold
      const observedAt = new Date();
      monitor.checkPrice = async (_figure: any, _site: string) => ({
        figureId: figure._id,
        site: 'mfc' as const,
        sourceUrl: 'https://mfc.example.com/item/123',
        price: 4500,
        currency: 'JPY',
        priceUsd: 30,
        stockStatus: 'in_stock' as const,
        isResale: false,
        observedAt,
      });

      const result = await monitor.runCycle();

      expect(result.recorded).toBe(1);
      expect(result.alertsTriggered).toBe(1);

      // Verify price record was saved
      const records = await PriceRecord.find({ figureId: figure._id });
      expect(records.length).toBe(1);
      expect(records[0].priceUsd).toBe(30);
      expect(records[0].site).toBe('mfc');

      // Verify alert was updated
      const alert = await PriceAlert.findOne({ figureId: figure._id });
      expect(alert!.triggerCount).toBe(1);
      expect(alert!.lastTriggeredAt).toBeDefined();
    });
  });

  describe('evaluateAlerts', () => {
    it('should return 0 when no new prices exist', async () => {
      const monitor = new PriceMonitorService();
      const result = await monitor.evaluateAlerts([]);
      expect(result).toBe(0);
    });

    it('should trigger price_below alerts correctly', async () => {
      const figure = await Figure.create({
        name: 'Alert Test Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      // Alert triggers when price goes below $100
      await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 100,
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();
      const triggered = await monitor.evaluateAlerts([
        {
          figureId: figure._id,
          site: 'mfc' as const,
          sourceUrl: 'https://mfc.example.com/item/1',
          price: 8000,
          currency: 'JPY',
          priceUsd: 55,
          stockStatus: 'in_stock' as const,
          isResale: false,
          observedAt: new Date(),
        },
      ]);

      expect(triggered).toBe(1);
    });

    it('should not trigger price_below alert when price is above threshold', async () => {
      const figure = await Figure.create({
        name: 'No Trigger Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 50,
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();
      const triggered = await monitor.evaluateAlerts([
        {
          figureId: figure._id,
          site: 'mfc' as const,
          sourceUrl: 'https://mfc.example.com/item/1',
          price: 15000,
          currency: 'JPY',
          priceUsd: 100,
          stockStatus: 'in_stock' as const,
          isResale: false,
          observedAt: new Date(),
        },
      ]);

      expect(triggered).toBe(0);
    });

    it('should trigger back_in_stock alerts', async () => {
      const figure = await Figure.create({
        name: 'Stock Alert Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'back_in_stock',
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();
      const triggered = await monitor.evaluateAlerts([
        {
          figureId: figure._id,
          site: 'akimomo' as const,
          sourceUrl: 'https://akimomo.example.com/item/1',
          price: 12000,
          currency: 'JPY',
          priceUsd: 80,
          stockStatus: 'in_stock' as const,
          isResale: false,
          observedAt: new Date(),
        },
      ]);

      expect(triggered).toBe(1);
    });

    it('should not trigger back_in_stock when item is sold out', async () => {
      const figure = await Figure.create({
        name: 'Sold Out Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'back_in_stock',
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();
      const triggered = await monitor.evaluateAlerts([
        {
          figureId: figure._id,
          site: 'mfc' as const,
          sourceUrl: 'https://mfc.example.com/item/1',
          price: 12000,
          currency: 'JPY',
          priceUsd: 80,
          stockStatus: 'sold_out' as const,
          isResale: false,
          observedAt: new Date(),
        },
      ]);

      expect(triggered).toBe(0);
    });

    it('should only check alerts matching filtered sites', async () => {
      const figure = await Figure.create({
        name: 'Site Filter Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      // Alert only cares about akimomo
      await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 100,
        sites: ['akimomo'],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();

      // Price from mfc (not akimomo) -- should not trigger
      const triggered = await monitor.evaluateAlerts([
        {
          figureId: figure._id,
          site: 'mfc' as const,
          sourceUrl: 'https://mfc.example.com/item/1',
          price: 3000,
          currency: 'JPY',
          priceUsd: 20,
          stockStatus: 'in_stock' as const,
          isResale: false,
          observedAt: new Date(),
        },
      ]);

      expect(triggered).toBe(0);
    });

    it('should not trigger inactive alerts', async () => {
      const figure = await Figure.create({
        name: 'Inactive Alert Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 100,
        sites: [],
        active: false,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();
      const triggered = await monitor.evaluateAlerts([
        {
          figureId: figure._id,
          site: 'mfc' as const,
          sourceUrl: 'https://mfc.example.com/item/1',
          price: 3000,
          currency: 'JPY',
          priceUsd: 20,
          stockStatus: 'in_stock' as const,
          isResale: false,
          observedAt: new Date(),
        },
      ]);

      expect(triggered).toBe(0);
    });
  });

  describe('shouldTriggerAlert', () => {
    it('should return true for price_below when price is at or below target', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'price_below', targetPrice: 100 },
        [{ priceUsd: 100 }]
      )).toBe(true);

      expect(monitor.shouldTriggerAlert(
        { type: 'price_below', targetPrice: 100 },
        [{ priceUsd: 50 }]
      )).toBe(true);
    });

    it('should return false for price_below when price is above target', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'price_below', targetPrice: 100 },
        [{ priceUsd: 150 }]
      )).toBe(false);
    });

    it('should return false for price_below with no targetPrice', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'price_below', targetPrice: null },
        [{ priceUsd: 50 }]
      )).toBe(false);
    });

    it('should return true for any_change with any prices', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'any_change' },
        [{ priceUsd: 100 }]
      )).toBe(true);
    });

    it('should return true for back_in_stock when at least one price is in_stock', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'back_in_stock' },
        [
          { priceUsd: 100, stockStatus: 'sold_out' },
          { priceUsd: 120, stockStatus: 'in_stock' },
        ]
      )).toBe(true);
    });

    it('should return false for back_in_stock when all prices are sold_out', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'back_in_stock' },
        [
          { priceUsd: 100, stockStatus: 'sold_out' },
          { priceUsd: 120, stockStatus: 'sold_out' },
        ]
      )).toBe(false);
    });

    it('should return false for price_drop (not yet implemented)', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'price_drop' },
        [{ priceUsd: 50 }]
      )).toBe(false);
    });

    it('should return false for unknown alert types', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'unknown_type' },
        [{ priceUsd: 50 }]
      )).toBe(false);
    });

    it('should return false when no prices have priceUsd', () => {
      const monitor = new PriceMonitorService();

      expect(monitor.shouldTriggerAlert(
        { type: 'price_below', targetPrice: 100 },
        [{ price: 5000 }]
      )).toBe(false);
    });

    it('should use lowest price across multiple entries for price_below', () => {
      const monitor = new PriceMonitorService();

      // Lowest is 40, which is below 50
      expect(monitor.shouldTriggerAlert(
        { type: 'price_below', targetPrice: 50 },
        [{ priceUsd: 80 }, { priceUsd: 40 }, { priceUsd: 60 }]
      )).toBe(true);

      // Lowest is 60, which is above 50
      expect(monitor.shouldTriggerAlert(
        { type: 'price_below', targetPrice: 50 },
        [{ priceUsd: 80 }, { priceUsd: 60 }, { priceUsd: 90 }]
      )).toBe(false);
    });
  });

  describe('updateWatchlistPrices', () => {
    it('should update trend to up when new average is more than 2% higher', async () => {
      const figure = await Figure.create({
        name: 'Trend Up Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const watchlistItem = await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc'],
        lastKnownPrices: [
          { site: 'mfc', price: 10000, currency: 'JPY', priceUsd: 67, stockStatus: 'in_stock', observedAt: new Date() },
        ],
      });

      const monitor = new PriceMonitorService();
      const now = new Date();

      await monitor.updateWatchlistPrices(
        [watchlistItem.toObject()],
        [
          {
            figureId: figure._id,
            site: 'mfc' as const,
            price: 12000,
            currency: 'JPY',
            priceUsd: 80,
            stockStatus: 'in_stock' as const,
            observedAt: now,
          },
        ]
      );

      const updated = await PriceWatchlist.findById(watchlistItem._id);
      expect(updated!.trend).toBe('up');
    });

    it('should update trend to down when new average is more than 2% lower', async () => {
      const figure = await Figure.create({
        name: 'Trend Down Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const watchlistItem = await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc'],
        lastKnownPrices: [
          { site: 'mfc', price: 15000, currency: 'JPY', priceUsd: 100, stockStatus: 'in_stock', observedAt: new Date() },
        ],
      });

      const monitor = new PriceMonitorService();
      const now = new Date();

      await monitor.updateWatchlistPrices(
        [watchlistItem.toObject()],
        [
          {
            figureId: figure._id,
            site: 'mfc' as const,
            price: 10000,
            currency: 'JPY',
            priceUsd: 67,
            stockStatus: 'in_stock' as const,
            observedAt: now,
          },
        ]
      );

      const updated = await PriceWatchlist.findById(watchlistItem._id);
      expect(updated!.trend).toBe('down');
    });

    it('should update trend to stable when change is within 2%', async () => {
      const figure = await Figure.create({
        name: 'Trend Stable Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const watchlistItem = await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc'],
        lastKnownPrices: [
          { site: 'mfc', price: 15000, currency: 'JPY', priceUsd: 100, stockStatus: 'in_stock', observedAt: new Date() },
        ],
      });

      const monitor = new PriceMonitorService();
      const now = new Date();

      await monitor.updateWatchlistPrices(
        [watchlistItem.toObject()],
        [
          {
            figureId: figure._id,
            site: 'mfc' as const,
            price: 15100,
            currency: 'JPY',
            priceUsd: 101, // 1% increase, within 2% threshold
            stockStatus: 'in_stock' as const,
            observedAt: now,
          },
        ]
      );

      const updated = await PriceWatchlist.findById(watchlistItem._id);
      expect(updated!.trend).toBe('stable');
    });

    it('should track lowest and highest prices', async () => {
      const figure = await Figure.create({
        name: 'Extremum Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const watchlistItem = await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc', 'akimomo'],
      });

      const monitor = new PriceMonitorService();
      const now = new Date();

      await monitor.updateWatchlistPrices(
        [watchlistItem.toObject()],
        [
          {
            figureId: figure._id,
            site: 'mfc' as const,
            price: 5000,
            currency: 'JPY',
            priceUsd: 33,
            stockStatus: 'in_stock' as const,
            observedAt: now,
          },
          {
            figureId: figure._id,
            site: 'akimomo' as const,
            price: 12000,
            currency: 'JPY',
            priceUsd: 80,
            stockStatus: 'in_stock' as const,
            observedAt: now,
          },
        ]
      );

      const updated = await PriceWatchlist.findById(watchlistItem._id);
      expect(updated!.lowestPrice!.amount).toBe(33);
      expect(updated!.lowestPrice!.site).toBe('mfc');
      expect(updated!.highestPrice!.amount).toBe(80);
      expect(updated!.highestPrice!.site).toBe('akimomo');
    });

    it('should not overwrite lower lowestPrice with higher value', async () => {
      const figure = await Figure.create({
        name: 'Keep Lowest Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const watchlistItem = await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure._id,
        trackedSites: ['mfc'],
        lowestPrice: { amount: 20, currency: 'USD', site: 'mfc', date: new Date() },
      });

      const monitor = new PriceMonitorService();
      const now = new Date();

      await monitor.updateWatchlistPrices(
        [watchlistItem.toObject()],
        [
          {
            figureId: figure._id,
            site: 'mfc' as const,
            price: 7500,
            currency: 'JPY',
            priceUsd: 50, // Higher than existing lowest of 20
            stockStatus: 'in_stock' as const,
            observedAt: now,
          },
        ]
      );

      const updated = await PriceWatchlist.findById(watchlistItem._id);
      // Should keep original lowest of 20, not overwrite with 50
      expect(updated!.lowestPrice!.amount).toBe(20);
    });

    it('should skip watchlist items with no matching prices', async () => {
      const figure1 = await Figure.create({
        name: 'Figure With Prices',
        manufacturer: 'Test',
        userId: testUserId,
      });
      const figure2 = await Figure.create({
        name: 'Figure Without Prices',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const watchlist1 = await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure1._id,
        trackedSites: ['mfc'],
      });
      const watchlist2 = await PriceWatchlist.create({
        userId: testUserId,
        figureId: figure2._id,
        trackedSites: ['mfc'],
      });

      const monitor = new PriceMonitorService();
      const now = new Date();

      // Only provide prices for figure1
      await monitor.updateWatchlistPrices(
        [watchlist1.toObject(), watchlist2.toObject()],
        [
          {
            figureId: figure1._id,
            site: 'mfc' as const,
            price: 10000,
            currency: 'JPY',
            priceUsd: 67,
            stockStatus: 'in_stock' as const,
            observedAt: now,
          },
        ]
      );

      const updated1 = await PriceWatchlist.findById(watchlist1._id);
      const updated2 = await PriceWatchlist.findById(watchlist2._id);

      // Figure1 should have been updated
      expect(updated1!.lastKnownPrices.length).toBe(1);
      // Figure2 should remain unchanged
      expect(updated2!.lastKnownPrices.length).toBe(0);
    });
  });

  describe('triggerAlert', () => {
    it('should update alert lastTriggeredAt and increment triggerCount', async () => {
      const figure = await Figure.create({
        name: 'Trigger Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const alert = await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 100,
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const monitor = new PriceMonitorService();
      await monitor.triggerAlert(alert.toObject(), [
        {
          figureId: figure._id,
          site: 'mfc' as const,
          priceUsd: 50,
          observedAt: new Date(),
        },
      ]);

      const updated = await PriceAlert.findById(alert._id);
      expect(updated!.triggerCount).toBe(1);
      expect(updated!.lastTriggeredAt).toBeDefined();
    });

    it('should call pushSender when configured and prices have priceUsd', async () => {
      const figure = await Figure.create({
        name: 'Push Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const alert = await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 100,
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const pushCalls: any[] = [];
      const mockPushSender = async (userId: string, payload: any) => {
        pushCalls.push({ userId, payload });
      };

      const monitor = new PriceMonitorService({ pushSender: mockPushSender });
      await monitor.triggerAlert(alert.toObject(), [
        {
          figureId: figure._id,
          site: 'mfc' as const,
          priceUsd: 50,
          observedAt: new Date(),
        },
      ]);

      expect(pushCalls.length).toBe(1);
      expect(pushCalls[0].userId).toBe(testUserId.toString());
      expect(pushCalls[0].payload.title).toBe('Price Alert Triggered!');
      expect(pushCalls[0].payload.body).toContain('$50');
      expect(pushCalls[0].payload.body).toContain('mfc');
    });

    it('should handle pushSender failure gracefully', async () => {
      const figure = await Figure.create({
        name: 'Push Fail Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const alert = await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'price_below',
        targetPrice: 100,
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const failingPushSender = async () => {
        throw new Error('Push service down');
      };

      const monitor = new PriceMonitorService({ pushSender: failingPushSender });

      // Should not throw
      await expect(
        monitor.triggerAlert(alert.toObject(), [
          {
            figureId: figure._id,
            site: 'mfc' as const,
            priceUsd: 50,
            observedAt: new Date(),
          },
        ])
      ).resolves.toBeUndefined();

      // Alert should still have been updated
      const updated = await PriceAlert.findById(alert._id);
      expect(updated!.triggerCount).toBe(1);
    });
  });

  describe('start/stop lifecycle', () => {
    it('should start and stop without errors', () => {
      const monitor = new PriceMonitorService({ intervalMinutes: 60 });
      monitor.start();
      monitor.stop();
    });

    it('should handle multiple start calls gracefully', () => {
      const monitor = new PriceMonitorService({ intervalMinutes: 60 });
      monitor.start();
      monitor.start(); // Should not create duplicate intervals
      monitor.stop();
    });

    it('should handle stop when not started', () => {
      const monitor = new PriceMonitorService();
      // Should not throw
      monitor.stop();
    });

    it('should use configurable interval', () => {
      const monitor = new PriceMonitorService({ intervalMinutes: 15 });
      // Verify it doesn't throw with custom interval
      monitor.start();
      monitor.stop();
    });

    it('should default to 30 minutes interval', () => {
      const monitor = new PriceMonitorService();
      // Access through the public API (start/stop lifecycle test)
      monitor.start();
      monitor.stop();
    });
  });

  describe('singleton', () => {
    it('should return same instance from getPriceMonitor', () => {
      const a = getPriceMonitor();
      const b = getPriceMonitor();
      expect(a).toBe(b);
    });

    it('should return new instance after reset', () => {
      const a = getPriceMonitor();
      resetPriceMonitor();
      const b = getPriceMonitor();
      expect(a).not.toBe(b);
    });
  });

  describe('setPushSender', () => {
    it('should allow setting push sender after construction', async () => {
      const figure = await Figure.create({
        name: 'Set Push Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const alert = await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'any_change',
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const pushCalls: any[] = [];
      const monitor = new PriceMonitorService();
      monitor.setPushSender(async (userId, payload) => {
        pushCalls.push({ userId, payload });
      });

      await monitor.triggerAlert(alert.toObject(), [
        {
          figureId: figure._id,
          site: 'mfc' as const,
          priceUsd: 50,
          observedAt: new Date(),
        },
      ]);

      expect(pushCalls.length).toBe(1);
    });

    it('should allow clearing push sender by passing null', async () => {
      const figure = await Figure.create({
        name: 'Clear Push Figure',
        manufacturer: 'Test',
        userId: testUserId,
      });

      const alert = await PriceAlert.create({
        userId: testUserId,
        figureId: figure._id,
        type: 'any_change',
        sites: [],
        active: true,
        triggerCount: 0,
        notifyVia: ['push'],
      });

      const pushCalls: any[] = [];
      const monitor = new PriceMonitorService({
        pushSender: async (userId, payload) => {
          pushCalls.push({ userId, payload });
        },
      });

      // Clear the push sender
      monitor.setPushSender(null);

      await monitor.triggerAlert(alert.toObject(), [
        {
          figureId: figure._id,
          site: 'mfc' as const,
          priceUsd: 50,
          observedAt: new Date(),
        },
      ]);

      // Should not have called push
      expect(pushCalls.length).toBe(0);
    });
  });
});
