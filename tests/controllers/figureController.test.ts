import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as figureController from '../../src/controllers/figureController';
import Figure from '../../src/models/Figure';
import axios from 'axios';
import * as searchService from '../../src/services/searchService';
import '../setup'; // Import test setup for environment variables

// Mock the search service
jest.mock('../../src/services/searchService', () => ({
  figureSearch: jest.fn()
}));
const mockedSearchService = jest.mocked(searchService);

// Comprehensive mocking for Figure model and external dependencies
jest.mock('../../src/models/Figure', () => {
  return {
    __esModule: true,
    default: {
      find: jest.fn(),
      findOne: jest.fn(),
      create: jest.fn(),
      countDocuments: jest.fn(),
      aggregate: jest.fn(),
      findByIdAndUpdate: jest.fn(),
      deleteOne: jest.fn()
    },
    // Maintain mongoose-like behavior for ObjectId conversion
    Types: {
      ObjectId: {
        isValid: jest.fn().mockReturnValue(true)
      }
    }
  };
});
const MockedFigure = jest.mocked(Figure);

// Enhanced axios mocking with more robust error handling
jest.mock('axios', () => ({
  __esModule: true,
  default: {
    post: jest.fn(),
    get: jest.fn(),
    create: jest.fn()
  },
  post: jest.fn(),
  get: jest.fn(),
  create: jest.fn()
}));
const mockedAxios = jest.mocked(axios);

describe('FigureController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<any>;

  beforeEach(() => {
    mockRequest = {
      user: { id: '000000000000000000000123' },
      query: {},
      params: {},
      body: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
    };
    mockNext = jest.fn();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('getFigures', () => {
    it('should get figures with default pagination', async () => {
      const mockFigures = [
        { _id: 'fig1', manufacturer: 'GSC', name: 'Miku', userId: '000000000000000000000123' },
        { _id: 'fig2', manufacturer: 'Alter', name: 'Rin', userId: '000000000000000000000123' }
      ];

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue(mockFigures)
      };

      MockedFigure.find = jest.fn().mockReturnValue(mockFind);
      MockedFigure.countDocuments = jest.fn().mockResolvedValue(2);

      await figureController.getFigures(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.find).toHaveBeenCalledWith({ userId: '000000000000000000000123' });
      expect(mockFind.sort).toHaveBeenCalledWith({ createdAt: -1 });
      expect(mockFind.skip).toHaveBeenCalledWith(0);
      expect(mockFind.limit).toHaveBeenCalledWith(10);
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        count: 2,
        page: 1,
        pages: 1,
        total: 2,
        data: mockFigures
      });
    });

    it('should handle pagination parameters', async () => {
      mockRequest.query = { page: '2', limit: '5' };

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };

      MockedFigure.find = jest.fn().mockReturnValue(mockFind);
      MockedFigure.countDocuments = jest.fn().mockResolvedValue(15);

      await figureController.getFigures(mockRequest as Request, mockResponse as Response);

      expect(mockFind.skip).toHaveBeenCalledWith(5); // (2-1) * 5
      expect(mockFind.limit).toHaveBeenCalledWith(5);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          page: 2,
          pages: 3,
          total: 15
        })
      );
    });

    it('should handle server errors', async () => {
      MockedFigure.find = jest.fn().mockImplementation(() => {
        throw new Error('Database error');
      });

      await figureController.getFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'An unexpected error occurred while fetching figures'
      });
    });
  });

  describe('getFigureById', () => {
    it('should get figure by id successfully', async () => {
      const mockFigure = {
        _id: 'fig123',
        manufacturer: 'GSC',
        name: 'Miku',
        userId: '000000000000000000000123'
      };

      mockRequest.params = { id: 'fig123' };
      MockedFigure.findOne = jest.fn().mockResolvedValue(mockFigure);

      await figureController.getFigureById(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.findOne).toHaveBeenCalledWith({
        _id: 'fig123',
        userId: '000000000000000000000123'
      });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockFigure
      });
    });

    it('should return 404 if figure not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      MockedFigure.findOne = jest.fn().mockResolvedValue(null);

      await figureController.getFigureById(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Figure not found'
      });
    });
  });

  describe('createFigure', () => {
    it('should create figure successfully without scraping', async () => {
      mockRequest.body = {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        location: 'Shelf A',
        boxNumber: 'Box 1'
      };

      const mockCreatedFigure = {
        _id: 'fig123',
        ...mockRequest.body,
        userId: '000000000000000000000123'
      };

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.create).toHaveBeenCalledWith({
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        mfcLink: '',
        location: 'Shelf A',
        boxNumber: 'Box 1',
        imageUrl: '',
        userId: '000000000000000000000123'
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockCreatedFigure
      });
    });

    it('should create figure with MFC scraping', async () => {
      mockRequest.body = {
        manufacturer: '',
        name: '',
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      const mockScrapedData = {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        imageUrl: 'https://example.com/image.jpg'
      };

      const mockCreatedFigure = {
        _id: 'fig123',
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        imageUrl: 'https://example.com/image.jpg',
        userId: '000000000000000000000123'
      };

      // Mock scraper service call
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: mockScrapedData
        }
      });

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://scraper-dev:3000/scrape/mfc',
        { url: 'https://myfigurecollection.net/item/12345' },
        expect.any(Object)
      );
      expect(MockedFigure.create).toHaveBeenCalledWith({
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        location: '',
        boxNumber: '',
        imageUrl: 'https://example.com/image.jpg',
        userId: '000000000000000000000123'
      });
    });

    it('should handle scraping service failure with fallback', async () => {
      mockRequest.body = {
        manufacturer: '',
        name: '',
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Mock scraper service failure
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Service down'));

      // Mock fallback axios call
      mockedAxios.get = jest.fn().mockResolvedValue({
        status: 200,
        headers: { 'content-type': 'text/html' },
        data: '<html><div class="item-picture"><div class="main"><img src="https://example.com/image.jpg"></div></div></html>'
      });

      const mockCreatedFigure = {
        _id: 'fig123',
        manufacturer: '',
        name: '',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        userId: '000000000000000000000123'
      };

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      expect(mockedAxios.post).toHaveBeenCalled();
      expect(mockedAxios.get).toHaveBeenCalled();
    });
  });

  describe('updateFigure', () => {
    it('should update figure successfully', async () => {
      mockRequest.params = { id: 'fig123' };
      mockRequest.body = {
        manufacturer: 'Updated Manufacturer',
        name: 'Updated Name',
        scale: '1/7'
      };

      const mockExistingFigure = {
        _id: 'fig123',
        manufacturer: 'Old Manufacturer',
        name: 'Old Name',
        userId: '000000000000000000000123',
        mfcLink: ''
      };

      const mockUpdatedFigure = {
        _id: 'fig123',
        manufacturer: 'Updated Manufacturer',
        name: 'Updated Name',
        scale: '1/7',
        userId: '000000000000000000000123'
      };

      MockedFigure.findOne = jest.fn().mockResolvedValue(mockExistingFigure);
      MockedFigure.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUpdatedFigure);

      await figureController.updateFigure(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.findOne).toHaveBeenCalledWith({
        _id: 'fig123',
        userId: '000000000000000000000123'
      });
      expect(MockedFigure.findByIdAndUpdate).toHaveBeenCalledWith(
        'fig123',
        expect.objectContaining({
          manufacturer: 'Updated Manufacturer',
          name: 'Updated Name',
          scale: '1/7'
        }),
        { new: true }
      );
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockUpdatedFigure
      });
    });

    it('should return 404 if figure not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      MockedFigure.findOne = jest.fn().mockResolvedValue(null);

      await figureController.updateFigure(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Figure not found or you do not have permission'
      });
    });
  });

  describe('deleteFigure', () => {
    it('should delete figure successfully', async () => {
      mockRequest.params = { id: 'fig123' };

      const mockFigure = {
        _id: 'fig123',
        manufacturer: 'GSC',
        name: 'Miku',
        userId: '000000000000000000000123'
      };

      MockedFigure.findOne = jest.fn().mockResolvedValue(mockFigure);
      MockedFigure.deleteOne = jest.fn().mockResolvedValue({ deletedCount: 1 });

      await figureController.deleteFigure(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.findOne).toHaveBeenCalledWith({
        _id: 'fig123',
        userId: '000000000000000000000123'
      });
      expect(MockedFigure.deleteOne).toHaveBeenCalledWith({ _id: 'fig123' });
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        message: 'Figure removed successfully'
      });
    });

    it('should return 404 if figure not found', async () => {
      mockRequest.params = { id: 'nonexistent' };
      MockedFigure.findOne = jest.fn().mockResolvedValue(null);

      await figureController.deleteFigure(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(404);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Figure not found or you do not have permission'
      });
    });
  });

  describe('scrapeMFCData', () => {
    beforeEach(() => {
      // Reset all mocks before each test
      jest.clearAllMocks();
    });

    it('should handle scraper service network errors', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate network error for both post and get (fallback)
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Network connection failed'));
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('Network connection failed'));

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: 'MANUAL_EXTRACT:https://myfigurecollection.net/item/12345',
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });

    it('should handle invalid data from scraper service', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate incomplete or invalid scraper response
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: {}
        }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {}
      });
    });
    it('should scrape MFC data successfully', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      const mockScrapedData = {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        imageUrl: 'https://example.com/image.jpg'
      };

      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: mockScrapedData
        }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: mockScrapedData
      });
    });

    it('should return error for missing MFC link', async () => {
      mockRequest.body = {};

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'MFC link is required'
      });
    });

    it('should return error for invalid URL', async () => {
      mockRequest.body = {
        mfcLink: 'not-a-valid-url'
      };

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid URL format'
      });
    });

    it('should return error for non-MFC URL', async () => {
      mockRequest.body = {
        mfcLink: 'https://example.com/item/12345'
      };

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'URL must be from myfigurecollection.net'
      });
    });
  });

  describe('searchFigures', () => {
    beforeEach(() => {
      // Reset mocks before each test
      jest.clearAllMocks();
    });

    it('should handle database errors during search', async () => {
      mockRequest.query = { query: 'Miku' };

      // Simulate a database error from the search service
      mockedSearchService.figureSearch.mockRejectedValue(new Error('Database connection failed'));

      await figureController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Database connection failed'
      });
    });

    it('should handle invalid search query formats', async () => {
      mockRequest.query = { query: '' };

      await figureController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Search query is required'
      });
    });

    it('should handle search with very long query', async () => {
      mockRequest.query = { query: 'A'.repeat(300) };

      // Mock successful search via service (no results for long nonsense query)
      mockedSearchService.figureSearch.mockResolvedValue([]);

      await figureController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        data: []
      });
    });

    it('should search figures via search service and return results', async () => {
      mockRequest.query = { query: 'Miku' };

      const userId = '000000000000000000000123';
      const mockSearchResults = [
        {
          _id: 'fig1',
          manufacturer: 'GSC',
          name: 'Hatsune Miku',
          scale: '1/8',
          mfcLink: '',
          location: 'Shelf A',
          boxNumber: 'Box 1',
          imageUrl: 'https://example.com/image.jpg',
          userId: new mongoose.Types.ObjectId(userId)
        }
      ];

      // Mock the search service
      mockedSearchService.figureSearch.mockResolvedValue(mockSearchResults as any);

      await figureController.searchFigures(mockRequest as Request, mockResponse as Response);

      // Verify the service was called with correct parameters
      expect(mockedSearchService.figureSearch).toHaveBeenCalledWith(
        'Miku',
        expect.any(mongoose.Types.ObjectId)
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: true,
          count: 1,
          data: expect.any(Array)
        })
      );

      // Check the actual response data separately for better debugging
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.data).toHaveLength(1);
      expect(responseCall.data[0]).toMatchObject({
        id: 'fig1',
        manufacturer: 'GSC',
        name: 'Hatsune Miku',
        scale: '1/8',
        mfcLink: '',
        location: 'Shelf A',
        boxNumber: 'Box 1',
        imageUrl: 'https://example.com/image.jpg',
        userId: expect.any(mongoose.Types.ObjectId)
      });
    });

    it('should return error if query parameter is missing', async () => {
      mockRequest.query = {};

      await figureController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Search query is required'
      });
    });
  });

  describe('filterFigures', () => {
    it('should filter figures with multiple criteria', async () => {
      mockRequest.query = {
        manufacturer: 'GSC',
        scale: '1/8',
        location: 'Shelf',
        page: '1',
        limit: '10'
      };

      const mockFind = {
        sort: jest.fn().mockReturnThis(),
        skip: jest.fn().mockReturnThis(),
        limit: jest.fn().mockResolvedValue([])
      };

      MockedFigure.find = jest.fn().mockReturnValue(mockFind);
      MockedFigure.countDocuments = jest.fn().mockResolvedValue(5);

      await figureController.filterFigures(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.find).toHaveBeenCalledWith({
        userId: '000000000000000000000123',
        manufacturer: { $regex: 'GSC', $options: 'i' },
        scale: { $regex: '1/8', $options: 'i' },
        location: { $regex: 'Shelf', $options: 'i' }
      });
    });
  });

  describe('getFigureStats', () => {
    it('should return figure statistics', async () => {
      const mockStatsResults = [
        { _id: 'GSC', count: 5 },
        { _id: 'Alter', count: 3 }
      ];

      MockedFigure.countDocuments = jest.fn().mockResolvedValue(8);
      MockedFigure.aggregate = jest.fn()
        .mockResolvedValueOnce(mockStatsResults) // manufacturer stats
        .mockResolvedValueOnce([{ _id: '1/8', count: 6 }]) // scale stats
        .mockResolvedValueOnce([{ _id: 'Shelf A', count: 4 }]); // location stats

      await figureController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          totalCount: 8,
          manufacturerStats: mockStatsResults,
          scaleStats: [{ _id: '1/8', count: 6 }],
          locationStats: [{ _id: 'Shelf A', count: 4 }]
        }
      });
    });

    it('should handle invalid user ID during stats retrieval', async () => {
      mockRequest.user = { id: 'INVALID_USER_ID' };

      await figureController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid user identifier'
      });
    });

    it('should handle database errors during statistics calculation', async () => {
      MockedFigure.countDocuments = jest.fn().mockRejectedValue(new Error('Database query failed'));

      await figureController.getFigureStats(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Database query failed'
      });
    });
  });

  describe('Local MFC Scraping Fallback Scenarios', () => {
    it('should handle local fallback when scraper service fails completely', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate scraper service completely failing
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Service completely down'));

      // Mock a failing local axios method
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('Local fallback failed'));

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: 'MANUAL_EXTRACT:https://myfigurecollection.net/item/12345',
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });

    it('should handle Cloudflare challenge detection during scraping', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate Cloudflare challenge page
      mockedAxios.post = jest.fn().mockRejectedValue({
        response: {
          data: 'Just a moment... cf-challenge',
          status: 403
        }
      });

      // Ensure fallback is called but fails
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('Cloudflare blocked'));

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: 'MANUAL_EXTRACT:https://myfigurecollection.net/item/12345',
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });

    it('should handle manual extraction when all scraping methods fail', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate all scraping methods failing
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Scraper service completely down'));
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('Local axios scraping failed'));

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: `MANUAL_EXTRACT:https://myfigurecollection.net/item/12345`,
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });
  });

  describe('Advanced Error Handling Scenarios', () => {
    it('should handle invalid or blocked scraper with manual extraction marker', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate a scenario where scraping completely fails with error details
      mockedAxios.post = jest.fn().mockRejectedValue({
        response: {
          status: 403,
          data: 'Access Denied',
          headers: { 'content-type': 'text/html' }
        }
      });

      // Local fallback also fails
      mockedAxios.get = jest.fn().mockRejectedValue(new Error('Local scraping blocked'));

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: `MANUAL_EXTRACT:https://myfigurecollection.net/item/12345`,
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });

    it('should handle non-string input during MFC data scraping', async () => {
      mockRequest.body = {
        mfcLink: null // Non-string input
      };

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'MFC link is required'
      });
    });

    it('should handle empty manufacturer name during figure creation', async () => {
      mockRequest.body = {
        manufacturer: '',
        name: 'Test Figure',
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Mock scraping to return data
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            manufacturer: 'Test Manufacturer',
            name: 'Test Figure',
            imageUrl: 'https://example.com/image.jpg'
          }
        }
      });

      const mockCreatedFigure = {
        _id: 'fig123',
        manufacturer: 'Test Manufacturer',
        name: 'Test Figure',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        imageUrl: 'https://example.com/image.jpg',
        userId: '000000000000000000000123'
      };

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.create).toHaveBeenCalledWith(expect.objectContaining({
        manufacturer: 'Test Manufacturer',
        name: 'Test Figure'
      }));
    });

    it('should handle server errors during figure creation', async () => {
      mockRequest.body = {
        manufacturer: 'Test Manufacturer',
        name: 'Test Figure'
      };

      // Simulate database error
      MockedFigure.create = jest.fn().mockRejectedValue(new Error('Database connection failed'));

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'An unexpected error occurred during figure creation'
      });
    });

    it('should handle complex scraping data merging scenarios', async () => {
      mockRequest.body = {
        manufacturer: 'Partial Manufacturer',
        name: '',
        scale: '',
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Mock scraping to return comprehensive data
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: {
            manufacturer: 'Complete Manufacturer',
            name: 'Complete Name',
            scale: '1/8',
            imageUrl: 'https://example.com/detailed-image.jpg'
          }
        }
      });

      const mockCreatedFigure = {
        _id: 'fig123',
        manufacturer: 'Complete Manufacturer',
        name: 'Complete Name',
        scale: '1/8',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        imageUrl: 'https://example.com/detailed-image.jpg',
        userId: '000000000000000000000123'
      };

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.create).toHaveBeenCalledWith(expect.objectContaining({
        manufacturer: 'Partial Manufacturer',
        name: 'Complete Name',
        scale: '1/8',
        imageUrl: 'https://example.com/detailed-image.jpg'
      }));
    });
  });

  describe('Smart Scraping - needsScrape Conditional', () => {
    it('should skip scraping when all fields are already provided', async () => {
      mockRequest.body = {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        imageUrl: 'https://example.com/image.jpg',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        location: 'Shelf A',
        boxNumber: 'Box 1'
      };

      const mockCreatedFigure = {
        _id: 'fig123',
        ...mockRequest.body,
        userId: '000000000000000000000123'
      };

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      // Scraper should NOT be called when all fields are provided
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(MockedFigure.create).toHaveBeenCalledWith({
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/8',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        location: 'Shelf A',
        boxNumber: 'Box 1',
        imageUrl: 'https://example.com/image.jpg',
        userId: '000000000000000000000123'
      });
      expect(mockResponse.status).toHaveBeenCalledWith(201);
    });

    it('should scrape when any required field is missing', async () => {
      mockRequest.body = {
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '', // Missing scale - should trigger scrape
        imageUrl: 'https://example.com/image.jpg',
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      const mockScrapedData = {
        manufacturer: 'Scraped Manufacturer',
        name: 'Scraped Name',
        scale: '1/7',
        imageUrl: 'https://scraped.com/image.jpg'
      };

      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: mockScrapedData
        }
      });

      const mockCreatedFigure = {
        _id: 'fig123',
        manufacturer: 'Good Smile Company',
        name: 'Hatsune Miku',
        scale: '1/7', // Scraped because it was empty
        imageUrl: 'https://example.com/image.jpg',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        userId: '000000000000000000000123'
      };

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      // Scraper SHOULD be called when scale is missing
      expect(mockedAxios.post).toHaveBeenCalled();
    });

    it('should pass mfcAuth to scraper when provided', async () => {
      mockRequest.body = {
        manufacturer: '',
        name: '',
        scale: '',
        mfcLink: 'https://myfigurecollection.net/item/12345',
        mfcAuth: 'PHPSESSID=abc123; sesUID=user456'
      };

      const mockScrapedData = {
        manufacturer: 'Good Smile Company',
        name: 'NSFW Figure',
        scale: '1/6',
        imageUrl: 'https://example.com/nsfw-image.jpg'
      };

      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: mockScrapedData
        }
      });

      const mockCreatedFigure = {
        _id: 'fig123',
        ...mockScrapedData,
        mfcLink: 'https://myfigurecollection.net/item/12345',
        userId: '000000000000000000000123'
      };

      MockedFigure.create = jest.fn().mockResolvedValue(mockCreatedFigure);

      await figureController.createFigure(mockRequest as Request, mockResponse as Response);

      // Verify mfcAuth was passed to the scraper
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://scraper-dev:3000/scrape/mfc',
        {
          url: 'https://myfigurecollection.net/item/12345',
          mfcAuth: 'PHPSESSID=abc123; sesUID=user456'
        },
        expect.any(Object)
      );
    });

    it('should skip scrape on update when all fields are provided', async () => {
      mockRequest.params = { id: 'fig123' };
      mockRequest.body = {
        manufacturer: 'Updated Manufacturer',
        name: 'Updated Name',
        scale: '1/7',
        imageUrl: 'https://example.com/updated-image.jpg',
        mfcLink: 'https://myfigurecollection.net/item/99999' // Different from existing
      };

      const mockExistingFigure = {
        _id: 'fig123',
        manufacturer: 'Old Manufacturer',
        name: 'Old Name',
        scale: '1/8',
        imageUrl: 'https://example.com/old-image.jpg',
        mfcLink: 'https://myfigurecollection.net/item/12345', // Different from new
        userId: '000000000000000000000123'
      };

      const mockUpdatedFigure = {
        _id: 'fig123',
        ...mockRequest.body,
        userId: '000000000000000000000123'
      };

      MockedFigure.findOne = jest.fn().mockResolvedValue(mockExistingFigure);
      MockedFigure.findByIdAndUpdate = jest.fn().mockResolvedValue(mockUpdatedFigure);

      await figureController.updateFigure(mockRequest as Request, mockResponse as Response);

      // Scraper should NOT be called when all fields are provided
      expect(mockedAxios.post).not.toHaveBeenCalled();
      expect(mockResponse.status).toHaveBeenCalledWith(200);
    });

    it('should pass mfcAuth to scraper on update when needed', async () => {
      mockRequest.params = { id: 'fig123' };
      mockRequest.body = {
        manufacturer: 'Test Manufacturer',
        name: 'Test Name',
        scale: '', // Missing - triggers scrape
        mfcLink: 'https://myfigurecollection.net/item/99999',
        mfcAuth: 'PHPSESSID=xyz789'
      };

      const mockExistingFigure = {
        _id: 'fig123',
        manufacturer: 'Old Manufacturer',
        name: 'Old Name',
        mfcLink: 'https://myfigurecollection.net/item/12345', // Different
        userId: '000000000000000000000123'
      };

      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: { scale: '1/8' }
        }
      });

      MockedFigure.findOne = jest.fn().mockResolvedValue(mockExistingFigure);
      MockedFigure.findByIdAndUpdate = jest.fn().mockResolvedValue({
        ...mockExistingFigure,
        ...mockRequest.body,
        scale: '1/8'
      });

      await figureController.updateFigure(mockRequest as Request, mockResponse as Response);

      // Verify mfcAuth was passed
      expect(mockedAxios.post).toHaveBeenCalledWith(
        'http://scraper-dev:3000/scrape/mfc',
        {
          url: 'https://myfigurecollection.net/item/99999',
          mfcAuth: 'PHPSESSID=xyz789'
        },
        expect.any(Object)
      );
    });

    it('should return NSFW auth error message when scraping requires authentication', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate NSFW auth error from scraper
      mockedAxios.post = jest.fn().mockRejectedValue({
        response: {
          data: {
            message: 'NSFW_AUTH_REQUIRED: This item requires MFC authentication'
          }
        }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      // Should return 500 with the auth error message passed through
      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'NSFW_AUTH_REQUIRED: This item requires MFC authentication',
        error: 'NSFW_AUTH_REQUIRED: This item requires MFC authentication'
      });
    });

    it('should return MFC item not accessible error message', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Simulate item not accessible error
      mockedAxios.post = jest.fn().mockRejectedValue({
        response: {
          data: {
            message: 'MFC_ITEM_NOT_ACCESSIBLE: Item no longer exists'
          }
        }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'MFC_ITEM_NOT_ACCESSIBLE: Item no longer exists',
        error: 'MFC_ITEM_NOT_ACCESSIBLE: Item no longer exists'
      });
    });

    it('should use local fallback and succeed when scraper service fails', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Scraper service fails
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Local fallback succeeds with HTML response
      const mockHtml = `
        <html>
          <body>
            <div class="item-picture"><div class="main"><img src="https://example.com/image.jpg" /></div></div>
            <span switch>TestManufacturer</span>
            <span switch>TestName</span>
            <div class="item-scale"><a title="Scale">1/8</a></div>
          </body>
        </html>
      `;
      mockedAxios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: mockHtml,
        headers: { 'content-type': 'text/html' }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: expect.objectContaining({
          imageUrl: 'https://example.com/image.jpg',
          manufacturer: 'TestManufacturer',
          name: 'TestName'
        })
      });
    });

    it('should handle local fallback returning empty response data', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Scraper service fails
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Local fallback returns empty response
      mockedAxios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: null,
        headers: { 'content-type': 'text/html' }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      // Should return MANUAL_EXTRACT when no data
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: 'MANUAL_EXTRACT:https://myfigurecollection.net/item/12345',
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });

    it('should detect Cloudflare challenge in local fallback response', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Scraper service fails
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Local fallback returns Cloudflare challenge page
      mockedAxios.get = jest.fn().mockResolvedValue({
        status: 200,
        data: '<html><body>Just a moment... cf-challenge</body></html>',
        headers: { 'content-type': 'text/html' }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      // Should return MANUAL_EXTRACT when Cloudflare blocked
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: 'MANUAL_EXTRACT:https://myfigurecollection.net/item/12345',
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });

    it('should handle 403 status in local fallback response', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Scraper service fails
      mockedAxios.post = jest.fn().mockRejectedValue(new Error('Service unavailable'));

      // Local fallback returns 403
      mockedAxios.get = jest.fn().mockResolvedValue({
        status: 403,
        data: '<html><body>Access Denied</body></html>',
        headers: { 'content-type': 'text/html' }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      // Should return MANUAL_EXTRACT when 403
      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {
          imageUrl: 'MANUAL_EXTRACT:https://myfigurecollection.net/item/12345',
          manufacturer: '',
          name: '',
          scale: ''
        }
      });
    });

    it('should handle scraper returning empty data object', async () => {
      mockRequest.body = {
        mfcLink: 'https://myfigurecollection.net/item/12345'
      };

      // Scraper returns success but empty data
      mockedAxios.post = jest.fn().mockResolvedValue({
        data: {
          success: true,
          data: null
        }
      });

      await figureController.scrapeMFCData(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        data: {}
      });
    });
  });
});