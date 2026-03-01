import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as searchController from '../../src/controllers/searchController';
import * as searchService from '../../src/services/search';
import '../setup';

// Mock the search service
jest.mock('../../src/services/search', () => ({
  figureSearch: jest.fn(),
  publicSearch: jest.fn(),
}));
const mockedSearchService = jest.mocked(searchService);

describe('SearchController', () => {
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

  describe('searchFigures', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;
      mockRequest.query = { query: 'test' };

      await searchController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not authenticated',
      });
    });

    it('should return 400 when query is missing', async () => {
      mockRequest.query = {};

      await searchController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Search query is required',
      });
    });

    it('should return 400 when query is empty string', async () => {
      mockRequest.query = { query: '' };

      await searchController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Search query is required',
      });
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID_NOT_OBJECTID' };
      mockRequest.query = { query: 'test' };

      await searchController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid user identifier',
      });
    });

    it('should call figureSearch and return results with v3 fields', async () => {
      mockRequest.query = { query: 'Miku' };
      const userId = '000000000000000000000123';

      const mockResults = [
        {
          _id: new mongoose.Types.ObjectId(),
          manufacturer: 'GSC',
          name: 'Hatsune Miku',
          scale: '1/8',
          mfcLink: '12345',
          imageUrl: 'https://example.com/miku.jpg',
          origin: 'Vocaloid',
          category: 'Scale',
          tags: ['character:miku', 'series:vocaloid'],
          companyRoles: [{ companyName: 'GSC', roleName: 'Manufacturer' }],
          artistRoles: [{ artistName: 'Tanaka', roleName: 'Sculptor' }],
          userId: new mongoose.Types.ObjectId(userId),
          searchScore: 2.5,
        },
      ];

      mockedSearchService.figureSearch.mockResolvedValue(mockResults as any);

      await searchController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockedSearchService.figureSearch).toHaveBeenCalledWith(
        'Miku',
        expect.any(mongoose.Types.ObjectId)
      );

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.count).toBe(1);
      expect(responseCall.data[0]).toMatchObject({
        id: mockResults[0]._id,
        manufacturer: 'GSC',
        name: 'Hatsune Miku',
        scale: '1/8',
        mfcLink: '12345',
        imageUrl: 'https://example.com/miku.jpg',
        origin: 'Vocaloid',
        category: 'Scale',
        tags: ['character:miku', 'series:vocaloid'],
        companyRoles: [{ companyName: 'GSC', roleName: 'Manufacturer' }],
        artistRoles: [{ artistName: 'Tanaka', roleName: 'Sculptor' }],
        userId: expect.any(mongoose.Types.ObjectId),
        searchScore: 2.5,
      });
    });

    it('should return empty array when no results found', async () => {
      mockRequest.query = { query: 'nonexistent' };
      mockedSearchService.figureSearch.mockResolvedValue([]);

      await searchController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        data: [],
      });
    });

    it('should handle database errors during search', async () => {
      mockRequest.query = { query: 'Miku' };
      mockedSearchService.figureSearch.mockRejectedValue(new Error('Database connection failed'));

      await searchController.searchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Database connection failed',
      });
    });
  });

  describe('publicSearchFigures', () => {
    it('should not require authentication', async () => {
      mockRequest.user = undefined;
      mockRequest.query = { query: 'Miku' };
      mockedSearchService.publicSearch.mockResolvedValue([]);

      await searchController.publicSearchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(200);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: true,
        count: 0,
        data: [],
      });
    });

    it('should return 400 when query is missing', async () => {
      mockRequest.query = {};

      await searchController.publicSearchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Search query is required',
      });
    });

    it('should return 400 when query is empty string', async () => {
      mockRequest.query = { query: '' };

      await searchController.publicSearchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
    });

    it('should call publicSearch and return results without userId', async () => {
      mockRequest.query = { query: 'Miku' };

      const mockResults = [
        {
          _id: new mongoose.Types.ObjectId(),
          manufacturer: 'GSC',
          name: 'Hatsune Miku',
          scale: '1/8',
          mfcLink: '12345',
          imageUrl: 'https://example.com/miku.jpg',
          origin: 'Vocaloid',
          category: 'Scale',
          tags: ['character:miku'],
          companyRoles: [{ companyName: 'GSC', roleName: 'Manufacturer' }],
          artistRoles: [{ artistName: 'Tanaka', roleName: 'Sculptor' }],
          userId: new mongoose.Types.ObjectId(),
          searchScore: 1.5,
        },
      ];

      mockedSearchService.publicSearch.mockResolvedValue(mockResults as any);

      await searchController.publicSearchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockedSearchService.publicSearch).toHaveBeenCalledWith('Miku');
      expect(mockResponse.status).toHaveBeenCalledWith(200);

      const responseCall = (mockResponse.json as jest.Mock).mock.calls[0][0];
      expect(responseCall.success).toBe(true);
      expect(responseCall.count).toBe(1);
      // Verify userId is NOT in the response
      expect(responseCall.data[0]).not.toHaveProperty('userId');
      // Verify other fields are present
      expect(responseCall.data[0]).toMatchObject({
        id: mockResults[0]._id,
        manufacturer: 'GSC',
        name: 'Hatsune Miku',
        origin: 'Vocaloid',
        category: 'Scale',
        tags: ['character:miku'],
        companyRoles: [{ companyName: 'GSC', roleName: 'Manufacturer' }],
        artistRoles: [{ artistName: 'Tanaka', roleName: 'Sculptor' }],
        searchScore: 1.5,
      });
    });

    it('should handle errors during public search', async () => {
      mockRequest.query = { query: 'test' };
      mockedSearchService.publicSearch.mockRejectedValue(new Error('Search failed'));

      await searchController.publicSearchFigures(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Search failed',
      });
    });
  });
});
