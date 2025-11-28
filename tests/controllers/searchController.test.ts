import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { getSuggestions, getPartialMatches } from '../../src/controllers/searchController';
import * as searchService from '../../src/services/searchService';
import Figure from '../../src/models/Figure';
import User from '../../src/models/User';

// Mock the search service
jest.mock('../../src/services/searchService');

describe('Search Controller - getSuggestions', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseObject: any;
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();

    responseObject = {
      success: false,
      data: [],
      message: ''
    };

    mockRequest = {
      query: {},
      user: {
        id: testUserId.toString()
      }
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((result) => {
        responseObject = result;
        return mockResponse;
      })
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return suggestions for valid query', async () => {
    const mockResults = [
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Hatsune Miku',
        manufacturer: 'Good Smile Company',
        userId: testUserId
      }
    ];

    (searchService.wordWheelSearch as jest.Mock).mockResolvedValue(mockResults);

    mockRequest.query = { q: 'Miku' };

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(responseObject.success).toBe(true);
    expect(responseObject.data).toEqual(mockResults);
    expect(searchService.wordWheelSearch).toHaveBeenCalledWith('Miku', testUserId, 10);
  });

  it('should use custom limit parameter', async () => {
    (searchService.wordWheelSearch as jest.Mock).mockResolvedValue([]);

    mockRequest.query = { q: 'test', limit: '5' };

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(searchService.wordWheelSearch).toHaveBeenCalledWith('test', testUserId, 5);
  });

  it('should enforce maximum limit of 50', async () => {
    (searchService.wordWheelSearch as jest.Mock).mockResolvedValue([]);

    mockRequest.query = { q: 'test', limit: '100' };

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(searchService.wordWheelSearch).toHaveBeenCalledWith('test', testUserId, 50);
  });

  it('should return 400 if query parameter is missing', async () => {
    mockRequest.query = {};

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('Query parameter is required');
  });

  it('should return 400 if query is less than 2 characters', async () => {
    mockRequest.query = { q: 'M' };

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('Query must be at least 2 characters');
  });

  it('should return 400 if limit is not a positive integer', async () => {
    mockRequest.query = { q: 'test', limit: '-5' };

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('Limit must be a positive integer');
  });

  it('should return 401 if user is not authenticated', async () => {
    mockRequest.user = undefined;

    mockRequest.query = { q: 'test' };

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('User not authenticated');
  });

  it('should handle service errors gracefully', async () => {
    (searchService.wordWheelSearch as jest.Mock).mockRejectedValue(new Error('Database error'));

    mockRequest.query = { q: 'test' };

    await getSuggestions(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('An error occurred while fetching search suggestions');
  });
});

describe('Search Controller - getPartialMatches', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let responseObject: any;
  let testUserId: mongoose.Types.ObjectId;

  beforeEach(() => {
    testUserId = new mongoose.Types.ObjectId();

    responseObject = {
      success: false,
      data: [],
      message: ''
    };

    mockRequest = {
      query: {},
      user: {
        id: testUserId.toString()
      }
    };

    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockImplementation((result) => {
        responseObject = result;
        return mockResponse;
      })
    };
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should return partial matches for valid query', async () => {
    const mockResults = [
      {
        _id: new mongoose.Types.ObjectId(),
        name: 'Mikasa Ackerman',
        manufacturer: 'Alter',
        userId: testUserId
      }
    ];

    (searchService.partialSearch as jest.Mock).mockResolvedValue(mockResults);

    mockRequest.query = { q: 'kasa' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(200);
    expect(responseObject.success).toBe(true);
    expect(responseObject.data).toEqual(mockResults);
    expect(responseObject.count).toBe(1);
    expect(searchService.partialSearch).toHaveBeenCalledWith('kasa', testUserId, { limit: 10, offset: 0 });
  });

  it('should use custom limit and offset parameters', async () => {
    (searchService.partialSearch as jest.Mock).mockResolvedValue([]);

    mockRequest.query = { q: 'test', limit: '20', offset: '10' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(searchService.partialSearch).toHaveBeenCalledWith('test', testUserId, { limit: 20, offset: 10 });
  });

  it('should enforce maximum limit of 50', async () => {
    (searchService.partialSearch as jest.Mock).mockResolvedValue([]);

    mockRequest.query = { q: 'test', limit: '100' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(searchService.partialSearch).toHaveBeenCalledWith('test', testUserId, { limit: 50, offset: 0 });
  });

  it('should return 400 if query parameter is missing', async () => {
    mockRequest.query = {};

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('Query parameter is required');
  });

  it('should return 400 if query is less than 2 characters', async () => {
    mockRequest.query = { q: 'M' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('Query must be at least 2 characters');
  });

  it('should return 400 if limit is not a positive integer', async () => {
    mockRequest.query = { q: 'test', limit: '-5' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('Limit must be a positive integer');
  });

  it('should return 400 if offset is negative', async () => {
    mockRequest.query = { q: 'test', offset: '-1' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(400);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('Offset must be a non-negative integer');
  });

  it('should return 401 if user is not authenticated', async () => {
    mockRequest.user = undefined;

    mockRequest.query = { q: 'test' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(401);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('User not authenticated');
  });

  it('should handle service errors gracefully', async () => {
    (searchService.partialSearch as jest.Mock).mockRejectedValue(new Error('Database error'));

    mockRequest.query = { q: 'test' };

    await getPartialMatches(mockRequest as Request, mockResponse as Response);

    expect(mockResponse.status).toHaveBeenCalledWith(500);
    expect(responseObject.success).toBe(false);
    expect(responseObject.message).toBe('An error occurred while fetching partial matches');
  });
});
