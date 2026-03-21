/**
 * Price Monitor Service
 *
 * Periodically checks prices for items on users' watchlists by requesting
 * scrapes from the scraper service. Evaluates price alerts and sends
 * notifications when conditions are met.
 *
 * Architecture:
 * 1. Scheduler runs every N minutes (configurable, default 30)
 * 2. Collects all unique figure IDs from active watchlists
 * 3. Groups by site to batch scrape requests
 * 4. Sends scrape requests to scraper via REST or gRPC
 * 5. Records price snapshots as PriceRecords
 * 6. Evaluates all active alerts against new prices
 * 7. Sends push notifications for triggered alerts
 */

import PriceRecord, { IPriceRecord } from '../models/PriceRecord';
import PriceAlert from '../models/PriceAlert';
import PriceWatchlist from '../models/PriceWatchlist';
import Figure from '../models/Figure';
import { createLogger } from '../utils/logger';

const logger = createLogger('PRICE_MONITOR');

/** Result of a single monitoring cycle */
export interface MonitorCycleResult {
  /** True if the cycle was skipped because one was already running */
  skipped?: boolean;
  /** Number of unique figures checked */
  checked?: number;
  /** Number of price records created */
  recorded?: number;
  /** Number of alerts triggered */
  alertsTriggered?: number;
  /** Duration of the cycle in milliseconds */
  durationMs?: number;
}

/** Push notification payload for price alerts */
export interface PushNotificationPayload {
  title: string;
  body: string;
  url: string;
  tag: string;
  data: Record<string, string>;
}

/**
 * Optional push notification sender function.
 * When the push service is available, this can be set to send notifications.
 */
export type PushSender = (userId: string, payload: PushNotificationPayload) => Promise<void>;

export class PriceMonitorService {
  private intervalMs: number;
  private timer: NodeJS.Timeout | null = null;
  private isRunning: boolean = false;
  private pushSender: PushSender | null = null;

  constructor(options?: { intervalMinutes?: number; pushSender?: PushSender }) {
    this.intervalMs = (options?.intervalMinutes ?? 30) * 60 * 1000;
    this.pushSender = options?.pushSender ?? null;
  }

  /** Set an optional push notification sender */
  setPushSender(sender: PushSender | null): void {
    this.pushSender = sender;
  }

  /** Start the monitoring scheduler */
  start(): void {
    if (this.timer) return;
    logger.info(`Starting with ${this.intervalMs / 60000}min interval`);
    this.timer = setInterval(() => this.runCycle().catch(err => logger.error('Cycle error:', err)), this.intervalMs);
    this.timer.unref();
    // Run first cycle after a short delay (don't block startup)
    const startupTimer = setTimeout(() => this.runCycle().catch(err => logger.error('Initial cycle error:', err)), 10000);
    startupTimer.unref();
  }

  /** Stop the scheduler */
  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Run one monitoring cycle */
  async runCycle(): Promise<MonitorCycleResult> {
    if (this.isRunning) {
      logger.info('Cycle already running, skipping');
      return { skipped: true };
    }

    this.isRunning = true;
    const startTime = Date.now();

    try {
      // 1. Get all unique figures from active watchlists
      const watchlistItems = await PriceWatchlist.find({}).lean();
      const figureIds = [...new Set(watchlistItems.map(w => w.figureId.toString()))];

      if (figureIds.length === 0) {
        return { checked: 0, recorded: 0, alertsTriggered: 0, durationMs: Date.now() - startTime };
      }

      // 2. Get figures with their known site URLs
      const figures = await Figure.find({ _id: { $in: figureIds } }).lean();

      // 3. For each figure, check prices on tracked sites
      let recorded = 0;
      const newPrices: Array<Partial<IPriceRecord>> = [];

      for (const figure of figures) {
        // Get all watchlist entries for this figure to know which sites to check
        const watchEntries = watchlistItems.filter(w => w.figureId.toString() === figure._id.toString());

        // Collect all tracked sites across all users watching this figure
        const allSites = new Set<string>();
        for (const entry of watchEntries) {
          for (const site of entry.trackedSites) {
            allSites.add(site);
          }
        }

        // For each tracked site, request a price check
        for (const site of allSites) {
          try {
            const price = await this.checkPrice(figure, site);
            if (price) {
              newPrices.push(price);
              recorded++;
            }
          } catch (err) {
            logger.error(`Failed to check ${site} for figure ${figure._id}:`, err);
          }
        }
      }

      // 4. Bulk insert price records
      if (newPrices.length > 0) {
        await PriceRecord.insertMany(newPrices);
      }

      // 5. Evaluate alerts against new prices
      const alertsTriggered = await this.evaluateAlerts(newPrices);

      // 6. Update watchlist with latest prices
      await this.updateWatchlistPrices(watchlistItems, newPrices);

      const result: MonitorCycleResult = {
        checked: figureIds.length,
        recorded,
        alertsTriggered,
        durationMs: Date.now() - startTime,
      };

      logger.info('Cycle complete:', result);
      return result;

    } finally {
      this.isRunning = false;
    }
  }

  /**
   * Check price for a figure on a specific site.
   * This is a placeholder that will eventually call the scraper service
   * to re-extract price data. Returns null until scraper price endpoints exist.
   */
  async checkPrice(_figure: any, _site: string): Promise<Partial<IPriceRecord> | null> {
    // TODO: Call scraper service to get current price from site
    // const scraperResponse = await scraperClient.getPrice(figure.mfcId, site);
    return null;
  }

  /** Evaluate all active alerts against new prices */
  async evaluateAlerts(newPrices: Array<Partial<IPriceRecord>>): Promise<number> {
    if (newPrices.length === 0) return 0;

    let triggered = 0;
    const figureIds = [...new Set(newPrices.map(p => p.figureId?.toString()).filter(Boolean))];

    // Get all active alerts for these figures
    const alerts = await PriceAlert.find({
      figureId: { $in: figureIds },
      active: true,
    }).lean();

    for (const alert of alerts) {
      const relevantPrices = newPrices.filter(
        p => p.figureId?.toString() === alert.figureId.toString()
          && (alert.sites.length === 0 || alert.sites.includes(p.site as string))
      );

      if (relevantPrices.length === 0) continue;

      const shouldTrigger = this.shouldTriggerAlert(alert, relevantPrices);

      if (shouldTrigger) {
        triggered++;
        await this.triggerAlert(alert, relevantPrices);
      }
    }

    return triggered;
  }

  /** Check if an alert's conditions are met */
  shouldTriggerAlert(alert: any, prices: Array<Partial<IPriceRecord>>): boolean {
    const usdPrices = prices
      .map(p => p.priceUsd)
      .filter((p): p is number => p != null);

    if (usdPrices.length === 0) return false;

    const lowestUsd = Math.min(...usdPrices);

    switch (alert.type) {
      case 'price_below':
        return alert.targetPrice != null && lowestUsd <= alert.targetPrice;

      case 'price_drop':
        // Compare with previous price records
        // A full implementation would compare with the watchlist's lastKnownPrices
        // For now, returns false until historical comparison is implemented
        return false;

      case 'back_in_stock':
        return prices.some(p => p.stockStatus === 'in_stock');

      case 'any_change':
        return true;

      default:
        return false;
    }
  }

  /** Trigger an alert -- send notification and update alert record */
  async triggerAlert(alert: any, prices: Array<Partial<IPriceRecord>>): Promise<void> {
    const withPriceUsd = prices.filter((p): p is Partial<IPriceRecord> & { priceUsd: number } => p.priceUsd != null);
    const lowestPrice = withPriceUsd.length > 0
      ? withPriceUsd.reduce((min, p) => p.priceUsd < min.priceUsd ? p : min)
      : null;

    // Update alert record
    await PriceAlert.updateOne(
      { _id: alert._id },
      {
        lastTriggeredAt: new Date(),
        $inc: { triggerCount: 1 },
      }
    );

    // Send push notification if sender is available
    if (this.pushSender && lowestPrice) {
      try {
        await this.pushSender(alert.userId.toString(), {
          title: 'Price Alert Triggered!',
          body: `Price for tracked item is now $${lowestPrice.priceUsd} on ${lowestPrice.site}`,
          url: `/figure/${alert.figureId}`,
          tag: `price-alert-${alert._id}`,
          data: { type: 'price_alert', alertId: alert._id.toString() },
        });
      } catch {
        logger.info(`Alert triggered for user ${alert.userId} but push notification failed`);
      }
    } else {
      logger.info(`Alert triggered for user ${alert.userId} (no push sender configured)`);
    }
  }

  /** Update watchlist entries with latest prices */
  async updateWatchlistPrices(watchlistItems: any[], newPrices: Array<Partial<IPriceRecord>>): Promise<void> {
    for (const item of watchlistItems) {
      const itemPrices = newPrices.filter(p => p.figureId?.toString() === item.figureId.toString());
      if (itemPrices.length === 0) continue;

      const updates: any = {};

      // Update lastKnownPrices
      const lastKnown = itemPrices.map(p => ({
        site: p.site,
        price: p.price,
        currency: p.currency,
        priceUsd: p.priceUsd,
        stockStatus: p.stockStatus,
        observedAt: p.observedAt,
      }));
      updates.lastKnownPrices = lastKnown;

      // Update trend (compare with previous)
      const validPrices = itemPrices.filter(p => p.priceUsd != null);
      if (validPrices.length > 0) {
        const newAvg = validPrices.reduce((sum, p) => sum + (p.priceUsd ?? 0), 0) / validPrices.length;
        const oldPrices = item.lastKnownPrices || [];
        if (oldPrices.length > 0) {
          const oldAvg = oldPrices.reduce((sum: number, p: any) => sum + p.priceUsd, 0) / oldPrices.length;
          if (oldAvg > 0) {
            const change = (newAvg - oldAvg) / oldAvg;
            updates.trend = change > 0.02 ? 'up' : change < -0.02 ? 'down' : 'stable';
          }
        }
      }

      // Track lowest/highest
      const usdPrices = itemPrices.map(p => p.priceUsd).filter((p): p is number => p != null);
      if (usdPrices.length > 0) {
        const lowestNew = Math.min(...usdPrices);
        const highestNew = Math.max(...usdPrices);

        if (!item.lowestPrice || lowestNew < item.lowestPrice.amount) {
          const p = itemPrices.find(pr => pr.priceUsd === lowestNew)!;
          updates.lowestPrice = { amount: p.priceUsd, currency: 'USD', site: p.site, date: p.observedAt };
        }
        if (!item.highestPrice || highestNew > item.highestPrice.amount) {
          const p = itemPrices.find(pr => pr.priceUsd === highestNew)!;
          updates.highestPrice = { amount: p.priceUsd, currency: 'USD', site: p.site, date: p.observedAt };
        }
      }

      await PriceWatchlist.updateOne({ _id: item._id }, { $set: updates });
    }
  }
}

// Singleton
let instance: PriceMonitorService | null = null;

export function getPriceMonitor(): PriceMonitorService {
  if (!instance) instance = new PriceMonitorService();
  return instance;
}

/** Reset the singleton (for testing) */
export function resetPriceMonitor(): void {
  if (instance) {
    instance.stop();
    instance = null;
  }
}
