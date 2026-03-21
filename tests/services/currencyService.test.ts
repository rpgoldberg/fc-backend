import { CurrencyService, getCurrencyService, resetCurrencyService } from '../../src/services/currencyService';

// Mock global fetch
const mockFetch = jest.fn() as jest.MockedFunction<typeof global.fetch>;
global.fetch = mockFetch;

describe('CurrencyService', () => {
  let service: CurrencyService;

  beforeEach(() => {
    service = new CurrencyService();
    mockFetch.mockReset();
  });

  afterEach(() => {
    service.destroy();
  });

  // ─── convertToUsd ─────────────────────────────────────────────────────

  describe('convertToUsd', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: { JPY: 150, EUR: 0.9, GBP: 0.8, CAD: 1.35 }
        })
      } as Response);
      await service.initialize();
    });

    it('returns the same amount for USD', () => {
      expect(service.convertToUsd(100, 'USD')).toBe(100);
    });

    it('converts JPY to USD correctly (divide by rate)', () => {
      // 15000 JPY / 150 rate = 100 USD
      expect(service.convertToUsd(15000, 'JPY')).toBe(100);
    });

    it('converts EUR to USD correctly', () => {
      // 90 EUR / 0.9 rate = 100 USD
      expect(service.convertToUsd(90, 'EUR')).toBe(100);
    });

    it('handles case-insensitive currency codes', () => {
      expect(service.convertToUsd(15000, 'jpy')).toBe(100);
    });

    it('rounds to 2 decimal places', () => {
      // 1000 JPY / 150 = 6.666... -> 6.67
      expect(service.convertToUsd(1000, 'JPY')).toBe(6.67);
    });

    it('throws for unknown currency', () => {
      expect(() => service.convertToUsd(100, 'XYZ')).toThrow('Unknown currency: XYZ');
    });
  });

  describe('convertToUsd without initialization', () => {
    it('throws when rates are not initialized', () => {
      const uninitializedService = new CurrencyService();
      expect(() => uninitializedService.convertToUsd(100, 'JPY')).toThrow(
        'Exchange rates not initialized'
      );
    });
  });

  // ─── convert ──────────────────────────────────────────────────────────

  describe('convert', () => {
    beforeEach(async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: { JPY: 150, EUR: 0.9, GBP: 0.8 }
        })
      } as Response);
      await service.initialize();
    });

    it('returns the same amount when from === to', () => {
      expect(service.convert(100, 'JPY', 'JPY')).toBe(100);
    });

    it('converts between non-USD currencies via USD pivot', () => {
      // 15000 JPY -> USD: 15000/150 = 100 USD
      // 100 USD -> EUR: 100 * 0.9 = 90 EUR
      expect(service.convert(15000, 'JPY', 'EUR')).toBe(90);
    });

    it('converts to USD when to is USD', () => {
      expect(service.convert(15000, 'JPY', 'USD')).toBe(100);
    });

    it('throws for unknown target currency', () => {
      expect(() => service.convert(100, 'USD', 'XYZ')).toThrow('Unknown currency: XYZ');
    });

    it('rounds intermediate and final results to 2 decimal places', () => {
      // 1000 JPY -> USD: 1000/150 = 6.67 (rounded)
      // 6.67 USD -> GBP: 6.67 * 0.8 = 5.34 (rounded)
      expect(service.convert(1000, 'JPY', 'GBP')).toBe(5.34);
    });
  });

  // ─── refresh & fallback ───────────────────────────────────────────────

  describe('refresh', () => {
    it('fetches rates from the API', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: { JPY: 149.5, EUR: 0.92 }
        })
      } as Response);

      await service.refresh();

      const info = service.getRatesInfo();
      expect(info).not.toBeNull();
      expect(info!.currencyCount).toBe(2);
      expect(info!.updatedAt).toBeInstanceOf(Date);
    });

    it('uses fallback rates when API fails and no rates exist', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await service.refresh();

      const info = service.getRatesInfo();
      expect(info).not.toBeNull();
      // Fallback has 11 currencies
      expect(info!.currencyCount).toBe(11);

      // Verify fallback conversion works
      const usd = service.convertToUsd(149.5, 'JPY');
      expect(usd).toBe(1);
    });

    it('retains existing rates when API fails after successful fetch', async () => {
      // First: successful fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: { JPY: 150, EUR: 0.9 }
        })
      } as Response);
      await service.refresh();

      // Second: failed fetch - should keep existing rates
      mockFetch.mockRejectedValueOnce(new Error('API down'));
      await service.refresh();

      // Still has the original rates
      expect(service.convertToUsd(150, 'JPY')).toBe(1);
    });

    it('handles non-ok HTTP responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500
      } as Response);

      await service.refresh();

      // Should fall back to hardcoded rates
      const info = service.getRatesInfo();
      expect(info).not.toBeNull();
      expect(info!.currencyCount).toBe(11);
    });
  });

  // ─── initialize ───────────────────────────────────────────────────────

  describe('initialize', () => {
    it('fetches rates and starts the refresh timer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: { JPY: 150 }
        })
      } as Response);

      await service.initialize();

      const info = service.getRatesInfo();
      expect(info).not.toBeNull();
      expect(info!.currencyCount).toBe(1);
      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  // ─── getRatesInfo ─────────────────────────────────────────────────────

  describe('getRatesInfo', () => {
    it('returns null when no rates loaded', () => {
      expect(service.getRatesInfo()).toBeNull();
    });

    it('returns info after rates are loaded', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          rates: { JPY: 150, EUR: 0.9, GBP: 0.8 }
        })
      } as Response);

      await service.initialize();

      const info = service.getRatesInfo();
      expect(info).toEqual({
        updatedAt: expect.any(Date),
        currencyCount: 3
      });
    });
  });

  // ─── destroy ──────────────────────────────────────────────────────────

  describe('destroy', () => {
    it('clears the refresh timer', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({ rates: { JPY: 150 } })
      } as Response);

      await service.initialize();
      service.destroy();

      // Calling destroy again should be safe (idempotent)
      service.destroy();
    });
  });

  // ─── singleton ────────────────────────────────────────────────────────

  describe('singleton', () => {
    afterEach(() => {
      resetCurrencyService();
    });

    it('getCurrencyService returns the same instance', () => {
      const a = getCurrencyService();
      const b = getCurrencyService();
      expect(a).toBe(b);
    });

    it('resetCurrencyService creates a new instance', () => {
      const a = getCurrencyService();
      resetCurrencyService();
      const b = getCurrencyService();
      expect(a).not.toBe(b);
    });
  });
});
