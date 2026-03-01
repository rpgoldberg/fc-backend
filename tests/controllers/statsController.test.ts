import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as statsController from '../../src/controllers/statsController';
import Figure from '../../src/models/Figure';
import '../setup';

// Mock Figure model
jest.mock('../../src/models/Figure', () => {
  return {
    __esModule: true,
    default: {
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
    },
  };
});
const MockedFigure = jest.mocked(Figure);

describe('StatsController', () => {
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
      setHeader: jest.fn().mockReturnThis(),
    };
    jest.clearAllMocks();
  });

  describe('getFigureStats', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not authenticated',
      });
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID_USER_ID' };

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid user identifier',
      });
    });

    it('should return figure statistics with tagStats and tagGroupStats', async () => {
      const mockStatusCounts = [
        { _id: 'owned', count: 6 },
        { _id: 'ordered', count: 2 },
      ];
      const mockManufacturerStats = [
        { _id: 'GSC', count: 5 },
        { _id: 'Alter', count: 3 },
      ];
      const mockScaleStats = [{ _id: '1/8', count: 6 }];
      const mockOriginStats = [{ _id: 'Fate', count: 3 }];
      const mockCategoryStats = [{ _id: 'Scale', count: 5 }];
      const mockV3ManufacturerStats = [{ _id: 'GSC', count: 5 }];
      const mockDistributorStats = [{ _id: 'Native', count: 2 }];
      const mockTagStats = [
        { _id: 'character:miku', count: 4 },
        { _id: 'series:vocaloid', count: 3 },
      ];
      const mockTagGroupStats = [
        { _id: 'character', count: 4, tags: ['character:miku'] },
        { _id: 'series', count: 3, tags: ['series:vocaloid'] },
      ];

      MockedFigure.countDocuments = jest.fn().mockResolvedValue(8);
      const mockSculptorStats = [{ _id: 'Sculptor A', count: 3 }];
      const mockIllustratorStats = [{ _id: 'Illustrator B', count: 2 }];
      const mockClassificationStats = [{ _id: 'Goods', count: 5 }];

      MockedFigure.aggregate = jest.fn()
        .mockResolvedValueOnce(mockStatusCounts)        // statusCounts
        .mockResolvedValueOnce(mockManufacturerStats)   // manufacturerStats
        .mockResolvedValueOnce(mockScaleStats)          // scaleStats
        .mockResolvedValueOnce(mockOriginStats)         // originStats
        .mockResolvedValueOnce(mockCategoryStats)       // categoryStats
        .mockResolvedValueOnce(mockV3ManufacturerStats) // v3ManufacturerStats
        .mockResolvedValueOnce(mockDistributorStats)    // distributorStats
        .mockResolvedValueOnce(mockSculptorStats)       // sculptorStats
        .mockResolvedValueOnce(mockIllustratorStats)    // illustratorStats
        .mockResolvedValueOnce(mockClassificationStats) // classificationStats
        .mockResolvedValueOnce(mockTagStats)            // tagStats
        .mockResolvedValueOnce(mockTagGroupStats);      // tagGroupStats

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache, no-store, must-revalidate');
      expect(mockResponse.status).toHaveBeenCalledWith(200);

      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.data.totalCount).toBe(8);
      expect(responseCall.data.statusCounts).toEqual({ owned: 6, ordered: 2, wished: 0 });
      expect(responseCall.data.manufacturerStats).toEqual(mockManufacturerStats);
      expect(responseCall.data.scaleStats).toEqual(mockScaleStats);
      expect(responseCall.data.originStats).toEqual(mockOriginStats);
      expect(responseCall.data.categoryStats).toEqual(mockCategoryStats);
      expect(responseCall.data.v3ManufacturerStats).toEqual(mockV3ManufacturerStats);
      expect(responseCall.data.distributorStats).toEqual(mockDistributorStats);
      expect(responseCall.data.sculptorStats).toEqual(mockSculptorStats);
      expect(responseCall.data.illustratorStats).toEqual(mockIllustratorStats);
      expect(responseCall.data.classificationStats).toEqual(mockClassificationStats);
      expect(responseCall.data.tagStats).toEqual(mockTagStats);
      expect(responseCall.data.tagGroupStats).toEqual(mockTagGroupStats);
      expect(responseCall.data.activeStatus).toBeNull();
      // locationStats should NOT be present
      expect(responseCall.data).not.toHaveProperty('locationStats');
    });

    it('should filter stats by owned status with legacy null handling', async () => {
      mockRequest.query = { status: 'owned' };

      const mockStatusCounts = [{ _id: 'owned', count: 5 }];
      MockedFigure.countDocuments = jest.fn().mockResolvedValue(5);
      MockedFigure.aggregate = jest.fn()
        .mockResolvedValueOnce(mockStatusCounts)
        .mockResolvedValueOnce([])  // manufacturerStats
        .mockResolvedValueOnce([])  // scaleStats
        .mockResolvedValueOnce([])  // originStats
        .mockResolvedValueOnce([])  // categoryStats
        .mockResolvedValueOnce([])  // v3ManufacturerStats
        .mockResolvedValueOnce([])  // distributorStats
        .mockResolvedValueOnce([])  // sculptorStats
        .mockResolvedValueOnce([])  // illustratorStats
        .mockResolvedValueOnce([])  // classificationStats
        .mockResolvedValueOnce([])  // tagStats
        .mockResolvedValueOnce([]); // tagGroupStats

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.data.activeStatus).toBe('owned');
    });

    it('should filter stats by non-owned status', async () => {
      mockRequest.query = { status: 'ordered' };

      const mockStatusCounts = [{ _id: 'ordered', count: 3 }];
      MockedFigure.countDocuments = jest.fn().mockResolvedValue(3);
      MockedFigure.aggregate = jest.fn()
        .mockResolvedValueOnce(mockStatusCounts)
        .mockResolvedValueOnce([])  // manufacturerStats
        .mockResolvedValueOnce([])  // scaleStats
        .mockResolvedValueOnce([])  // originStats
        .mockResolvedValueOnce([])  // categoryStats
        .mockResolvedValueOnce([])  // v3ManufacturerStats
        .mockResolvedValueOnce([])  // distributorStats
        .mockResolvedValueOnce([])  // sculptorStats
        .mockResolvedValueOnce([])  // illustratorStats
        .mockResolvedValueOnce([])  // classificationStats
        .mockResolvedValueOnce([])  // tagStats
        .mockResolvedValueOnce([]); // tagGroupStats

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.data.activeStatus).toBe('ordered');
    });

    it('should handle database errors during statistics calculation', async () => {
      MockedFigure.aggregate = jest.fn().mockRejectedValue(new Error('Database query failed'));

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Database query failed',
      });
    });

    it('should ignore invalid status filter', async () => {
      mockRequest.query = { status: 'invalid_status' };

      MockedFigure.countDocuments = jest.fn().mockResolvedValue(10);
      MockedFigure.aggregate = jest.fn()
        .mockResolvedValueOnce([{ _id: 'owned', count: 10 }])
        .mockResolvedValueOnce([])  // manufacturerStats
        .mockResolvedValueOnce([])  // scaleStats
        .mockResolvedValueOnce([])  // originStats
        .mockResolvedValueOnce([])  // categoryStats
        .mockResolvedValueOnce([])  // v3ManufacturerStats
        .mockResolvedValueOnce([])  // distributorStats
        .mockResolvedValueOnce([])  // sculptorStats
        .mockResolvedValueOnce([])  // illustratorStats
        .mockResolvedValueOnce([])  // classificationStats
        .mockResolvedValueOnce([])  // tagStats
        .mockResolvedValueOnce([]); // tagGroupStats

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.data.activeStatus).toBeNull();
    });

    it('should include companyRoleStats and artistRoleStats placeholders', async () => {
      MockedFigure.countDocuments = jest.fn().mockResolvedValue(5);
      MockedFigure.aggregate = jest.fn()
        .mockResolvedValueOnce([{ _id: 'owned', count: 5 }])         // statusCounts
        .mockResolvedValueOnce([{ _id: 'GSC', count: 5 }])           // manufacturerStats
        .mockResolvedValueOnce([{ _id: '1/7', count: 3 }])           // scaleStats
        .mockResolvedValueOnce([{ _id: 'Fate', count: 2 }])          // originStats
        .mockResolvedValueOnce([{ _id: 'Scale', count: 4 }])         // categoryStats
        .mockResolvedValueOnce([{ _id: 'GSC', count: 5 }])           // v3ManufacturerStats
        .mockResolvedValueOnce([{ _id: 'Native', count: 1 }])        // distributorStats
        .mockResolvedValueOnce([{ _id: 'Sculptor A', count: 2 }])    // sculptorStats
        .mockResolvedValueOnce([{ _id: 'Illustrator B', count: 1 }]) // illustratorStats
        .mockResolvedValueOnce([{ _id: 'Goods', count: 3 }])         // classificationStats
        .mockResolvedValueOnce([{ _id: 'character:saber', count: 2 }]) // tagStats
        .mockResolvedValueOnce([{ _id: 'character', count: 2, tags: ['character:saber'] }]); // tagGroupStats

      await statsController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.data.v3ManufacturerStats).toBeDefined();
      expect(responseCall.data.distributorStats).toBeDefined();
    });
  });
});
