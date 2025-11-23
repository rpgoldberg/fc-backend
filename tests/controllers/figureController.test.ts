import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as figureController from '../../src/controllers/figureController';
import Figure from '../../src/models/Figure';
import axios from 'axios';
import '../setup'; // Import test setup for environment variables

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

      // Simulate a database error (test mode uses find, not aggregate)
      MockedFigure.find = jest.fn().mockRejectedValue(new Error('Database connection failed'));

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

      // Mock successful search (no results for long nonsense query)
      MockedFigure.find = jest.fn().mockResolvedValue([]);

      await figureController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        data: []
      });
    });
    it('should search figures using MongoDB Atlas Search with comprehensive mocking', async () => {
      // Temporarily override test mode to force Atlas Search path
      const originalNodeEnv = process.env.NODE_ENV;
      const originalTestMode = process.env.TEST_MODE;
      process.env.NODE_ENV = 'production';
      process.env.TEST_MODE = 'atlas';
      
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

      // Enhanced Atlas Search aggregation mocking with more robust pipeline simulation
      MockedFigure.aggregate = jest.fn().mockImplementation((pipeline) => {
        // Validate the search pipeline structure
        expect(pipeline[0].$search).toBeDefined();
        expect(pipeline[0].$search.compound).toBeDefined();

        // Simulate Atlas Search ranking and filtering
        const searchQuery = pipeline[0].$search.compound.must[0].text.query;
        const filteredResults = mockSearchResults.filter(figure => 
          figure.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          figure.manufacturer.toLowerCase().includes(searchQuery.toLowerCase())
        );

        return Promise.resolve(filteredResults);
      });

      await figureController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(MockedFigure.aggregate).toHaveBeenCalledWith([
        {
          $search: {
            index: 'figures',
            compound: {
              must: [{
                text: {
                  query: 'Miku',
                  path: ['manufacturer', 'name', 'location', 'boxNumber'],
                  fuzzy: {
                    maxEdits: 1,
                    prefixLength: 2
                  }
                }
              }],
              filter: [{
                equals: {
                  path: 'userId',
                  value: expect.any(mongoose.Types.ObjectId)
                }
              }]
            }
          }
        },
        expect.any(Object)
      ]);

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
      
      // Restore original environment
      process.env.NODE_ENV = originalNodeEnv;
      process.env.TEST_MODE = originalTestMode;
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
});