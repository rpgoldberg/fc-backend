import { createLogger } from '../utils/logger';

const logger = createLogger('CURRENCY');

interface ExchangeRates {
  base: string; // 'USD'
  rates: Record<string, number>; // e.g., { JPY: 149.5, EUR: 0.92, ... }
  updatedAt: Date;
}

const FALLBACK_RATES: Record<string, number> = {
  JPY: 149.5,
  EUR: 0.92,
  GBP: 0.79,
  CAD: 1.36,
  AUD: 1.53,
  CNY: 7.24,
  KRW: 1350,
  HKD: 7.82,
  TWD: 32.5,
  SGD: 1.34,
  THB: 35.5,
};

const REFRESH_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours

export class CurrencyService {
  private rates: ExchangeRates | null = null;
  private refreshTimer: ReturnType<typeof setInterval> | null = null;

  /** Initialize with an initial fetch and periodic refresh */
  async initialize(): Promise<void> {
    await this.refresh();
    this.refreshTimer = setInterval(
      () => this.refresh().catch((err) => logger.error('Periodic refresh failed:', err)),
      REFRESH_INTERVAL_MS
    );
    this.refreshTimer.unref();
  }

  /** Fetch latest rates from a free API */
  async refresh(): Promise<void> {
    try {
      const response = await fetch('https://open.er-api.com/v6/latest/USD');
      if (!response.ok) {
        throw new Error(`Exchange rate API returned ${response.status}`);
      }

      const data = await response.json();
      this.rates = {
        base: 'USD',
        rates: data.rates,
        updatedAt: new Date(),
      };

      logger.info(`Rates updated: ${Object.keys(this.rates.rates).length} currencies`);
    } catch (err) {
      logger.error('Failed to fetch rates:', err);

      // If no rates at all, use fallback hardcoded rates
      if (!this.rates) {
        this.rates = {
          base: 'USD',
          rates: { ...FALLBACK_RATES },
          updatedAt: new Date(),
        };
        logger.warn('Using fallback rates');
      }
    }
  }

  /** Convert an amount from one currency to USD */
  convertToUsd(amount: number, fromCurrency: string): number {
    if (fromCurrency === 'USD') return amount;

    if (!this.rates) {
      throw new Error('Exchange rates not initialized. Call initialize() first.');
    }

    const rate = this.rates.rates[fromCurrency.toUpperCase()];
    if (!rate) {
      throw new Error(`Unknown currency: ${fromCurrency}`);
    }

    // rate is X currency per 1 USD, so: USD = amount / rate
    return Math.round((amount / rate) * 100) / 100;
  }

  /** Convert between any two currencies */
  convert(amount: number, from: string, to: string): number {
    if (from === to) return amount;
    const usd = this.convertToUsd(amount, from);
    if (to === 'USD') return usd;

    if (!this.rates) {
      throw new Error('Exchange rates not initialized. Call initialize() first.');
    }

    const toRate = this.rates.rates[to.toUpperCase()];
    if (!toRate) {
      throw new Error(`Unknown currency: ${to}`);
    }

    return Math.round(usd * toRate * 100) / 100;
  }

  /** Get current rates info */
  getRatesInfo(): { updatedAt: Date; currencyCount: number } | null {
    if (!this.rates) return null;
    return {
      updatedAt: this.rates.updatedAt,
      currencyCount: Object.keys(this.rates.rates).length,
    };
  }

  /** Cleanup */
  destroy(): void {
    if (this.refreshTimer) {
      clearInterval(this.refreshTimer);
      this.refreshTimer = null;
    }
  }
}

// Singleton
let instance: CurrencyService | null = null;

export function getCurrencyService(): CurrencyService {
  if (!instance) {
    instance = new CurrencyService();
  }
  return instance;
}

export async function initializeCurrencyService(): Promise<void> {
  const service = getCurrencyService();
  await service.initialize();
}

/** Reset the singleton (for testing) */
export function resetCurrencyService(): void {
  if (instance) {
    instance.destroy();
    instance = null;
  }
}
