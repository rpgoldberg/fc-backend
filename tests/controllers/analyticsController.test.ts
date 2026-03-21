import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as analyticsController from '../../src/controllers/analyticsController';
import Figure from '../../src/models/Figure';
import PriceWatchlist from '../../src/models/PriceWatchlist';
import PriceAlert from '../../src/models/PriceAlert';
import '../setup';

// Mock models
jest.mock('../../src/models/Figure', () => ({
  __esModule: true,
  default: {
    aggregate: jest.fn(),
  },
}));

jest.mock('../../src/models/PriceWatchlist', () => ({
  __esModule: true,
  default: {
    find: jest.fn(),
  },
}));

jest.mock('../../src/models/PriceAlert', () => ({
  __esModule: true,
  default: {
    countDocuments: jest.fn(),
  },
}));

const MockedFigure = jest.mocked(Figure);
const MockedPriceWatchlist = jest.mocked(PriceWatchlist);
const MockedPriceAlert = jest.mocked(PriceAlert);

describe('AnalyticsController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {
      user: { id: '000000000000000000000123' },
      query: {},
      params: {},
      body: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  // ─── getCollectionAnalytics ────────────────────────────────────────────────

  describe('getCollectionAnalytics', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await analyticsController.getCollectionAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not authenticated',
      });
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID' };

      await analyticsController.getCollectionAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid user identifier',
      });
    });

    it('should return correct aggregate statistics', async () => {
      const mockStats = [
        {
          _id: null,
          totalFigures: 15,
          owned: 10,
          ordered: 3,
          wished: 2,
          totalValue: 2500,
          manufacturers: ['Good Smile Company', 'Alter', null],
          scales: ['1/7', '1/8', null],
          oldestAdded: new Date('2023-01-15'),
          newestAdded: new Date('2024-06-20'),
        },
      ];

      MockedFigure.aggregate = jest.fn().mockResolvedValue(mockStats);

      await analyticsController.getCollectionAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        analytics: {
          totalFigures: 15,
          owned: 10,
          ordered: 3,
          wished: 2,
          totalValue: 2500,
          manufacturers: ['Good Smile Company', 'Alter'],
          scales: ['1/7', '1/8'],
          oldestAdded: new Date('2023-01-15'),
          newestAdded: new Date('2024-06-20'),
        },
      });
    });

    it('should return default stats for empty collection', async () => {
      MockedFigure.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsController.getCollectionAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        analytics: {
          totalFigures: 0,
          owned: 0,
          ordered: 0,
          wished: 0,
          totalValue: 0,
          manufacturers: [],
          scales: [],
          oldestAdded: null,
          newestAdded: null,
        },
      });
    });

    it('should handle database errors', async () => {
      MockedFigure.aggregate = jest.fn().mockRejectedValue(new Error('DB error'));

      await analyticsController.getCollectionAnalytics(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'DB error',
      });
    });
  });

  // ─── getCollectionBreakdown ────────────────────────────────────────────────

  describe('getCollectionBreakdown', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID' };

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return 400 when groupBy is missing', async () => {
      mockRequest.query = {};

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid groupBy parameter. Must be one of: manufacturer, scale, origin, category',
      });
    });

    it('should return 400 when groupBy is invalid', async () => {
      mockRequest.query = { groupBy: 'nonexistent' };

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return breakdown grouped by manufacturer', async () => {
      mockRequest.query = { groupBy: 'manufacturer' };

      const mockBreakdown = [
        { _id: 'Good Smile Company', count: 8 },
        { _id: 'Alter', count: 5 },
        { _id: 'Kotobukiya', count: 2 },
      ];

      MockedFigure.aggregate = jest.fn().mockResolvedValue(mockBreakdown);

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        groupBy: 'manufacturer',
        breakdown: mockBreakdown,
      });
    });

    it('should return breakdown grouped by scale', async () => {
      mockRequest.query = { groupBy: 'scale' };

      const mockBreakdown = [
        { _id: '1/7', count: 6 },
        { _id: '1/8', count: 4 },
      ];

      MockedFigure.aggregate = jest.fn().mockResolvedValue(mockBreakdown);

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        groupBy: 'scale',
        breakdown: mockBreakdown,
      });
    });

    it('should return breakdown grouped by origin', async () => {
      mockRequest.query = { groupBy: 'origin' };

      const mockBreakdown = [
        { _id: 'Fate/Grand Order', count: 5 },
        { _id: 'Original', count: 3 },
      ];

      MockedFigure.aggregate = jest.fn().mockResolvedValue(mockBreakdown);

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        groupBy: 'origin',
        breakdown: mockBreakdown,
      });
    });

    it('should return breakdown grouped by category', async () => {
      mockRequest.query = { groupBy: 'category' };

      const mockBreakdown = [{ _id: 'Scale Figure', count: 12 }];

      MockedFigure.aggregate = jest.fn().mockResolvedValue(mockBreakdown);

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        groupBy: 'category',
        breakdown: mockBreakdown,
      });
    });

    it('should handle database errors', async () => {
      mockRequest.query = { groupBy: 'manufacturer' };
      MockedFigure.aggregate = jest.fn().mockRejectedValue(new Error('Aggregate failed'));

      await analyticsController.getCollectionBreakdown(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Aggregate failed',
      });
    });
  });

  // ─── getCollectionTimeline ─────────────────────────────────────────────────

  describe('getCollectionTimeline', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await analyticsController.getCollectionTimeline(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID' };

      await analyticsController.getCollectionTimeline(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return monthly timeline with default 12 months', async () => {
      const mockTimeline = [
        { _id: '2024-01', added: 3, statuses: ['owned', 'owned', 'ordered'] },
        { _id: '2024-02', added: 2, statuses: ['owned', 'wished'] },
        { _id: '2024-03', added: 1, statuses: ['owned'] },
      ];

      MockedFigure.aggregate = jest.fn().mockResolvedValue(mockTimeline);

      await analyticsController.getCollectionTimeline(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 12,
        timeline: mockTimeline,
      });
    });

    it('should respect custom months parameter', async () => {
      mockRequest.query = { months: '6' };
      MockedFigure.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsController.getCollectionTimeline(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 6,
        timeline: [],
      });
    });

    it('should cap months at 60', async () => {
      mockRequest.query = { months: '120' };
      MockedFigure.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsController.getCollectionTimeline(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 60,
        timeline: [],
      });
    });

    it('should default to 12 months for invalid months param', async () => {
      mockRequest.query = { months: 'abc' };
      MockedFigure.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsController.getCollectionTimeline(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 12,
        timeline: [],
      });
    });

    it('should handle database errors', async () => {
      MockedFigure.aggregate = jest.fn().mockRejectedValue(new Error('Timeline error'));

      await analyticsController.getCollectionTimeline(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Timeline error',
      });
    });
  });

  // ─── getPriceSummary ───────────────────────────────────────────────────────

  describe('getPriceSummary', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await analyticsController.getPriceSummary(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID' };

      await analyticsController.getPriceSummary(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return correct price trend summary', async () => {
      const mockWatchlist = [
        { trend: 'up' },
        { trend: 'up' },
        { trend: 'down' },
        { trend: 'stable' },
        { trend: 'unknown' },
      ];

      MockedPriceWatchlist.find = jest.fn().mockResolvedValue(mockWatchlist);
      MockedPriceAlert.countDocuments = jest.fn().mockResolvedValue(3);

      await analyticsController.getPriceSummary(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        summary: {
          trackedItems: 5,
          trendsUp: 2,
          trendsDown: 1,
          trendsStable: 1,
          alertsActive: 3,
        },
      });
    });

    it('should return empty summary when no watchlist items', async () => {
      MockedPriceWatchlist.find = jest.fn().mockResolvedValue([]);
      MockedPriceAlert.countDocuments = jest.fn().mockResolvedValue(0);

      await analyticsController.getPriceSummary(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        summary: {
          trackedItems: 0,
          trendsUp: 0,
          trendsDown: 0,
          trendsStable: 0,
          alertsActive: 0,
        },
      });
    });

    it('should handle database errors from watchlist query', async () => {
      MockedPriceWatchlist.find = jest.fn().mockRejectedValue(new Error('Watchlist error'));

      await analyticsController.getPriceSummary(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Watchlist error',
      });
    });

    it('should handle database errors from alert count query', async () => {
      MockedPriceWatchlist.find = jest.fn().mockResolvedValue([]);
      MockedPriceAlert.countDocuments = jest.fn().mockRejectedValue(new Error('Alert error'));

      await analyticsController.getPriceSummary(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Alert error',
      });
    });
  });

  // ─── getValueHistory ───────────────────────────────────────────────────────

  describe('getValueHistory', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await analyticsController.getValueHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(401);
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID' };

      await analyticsController.getValueHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should return value history grouped by month', async () => {
      const mockHistory = [
        { _id: '2024-01', monthlyValue: 500, itemsAdded: 2 },
        { _id: '2024-02', monthlyValue: 300, itemsAdded: 1 },
        { _id: '2024-03', monthlyValue: 800, itemsAdded: 3 },
      ];

      MockedFigure.aggregate = jest.fn().mockResolvedValue(mockHistory);

      await analyticsController.getValueHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 12,
        valueHistory: mockHistory,
      });
    });

    it('should return empty value history for collection without purchase prices', async () => {
      MockedFigure.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsController.getValueHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 12,
        valueHistory: [],
      });
    });

    it('should respect custom months parameter', async () => {
      mockRequest.query = { months: '24' };
      MockedFigure.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsController.getValueHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 24,
        valueHistory: [],
      });
    });

    it('should cap months at 60', async () => {
      mockRequest.query = { months: '100' };
      MockedFigure.aggregate = jest.fn().mockResolvedValue([]);

      await analyticsController.getValueHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        months: 60,
        valueHistory: [],
      });
    });

    it('should handle database errors', async () => {
      MockedFigure.aggregate = jest.fn().mockRejectedValue(new Error('Value error'));

      await analyticsController.getValueHistory(
        mockRequest as Request,
        mockResponse as Response
      );

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Value error',
      });
    });
  });
});
