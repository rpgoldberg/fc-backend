/**
 * Unit tests for Lookup Controller error handling
 *
 * Tests the catch blocks in getRoleTypes, getCompanies, getArtists
 * that handle database errors.
 */
import { Request, Response } from 'express';
import * as lookupController from '../../src/controllers/lookupController';
import RoleType from '../../src/models/RoleType';
import Company from '../../src/models/Company';
import Artist from '../../src/models/Artist';
import '../setup'; // Import test setup

// Mock the models
jest.mock('../../src/models/RoleType', () => {
  return {
    __esModule: true,
    default: {
      find: jest.fn()
    }
  };
});

jest.mock('../../src/models/Company', () => {
  return {
    __esModule: true,
    default: {
      find: jest.fn()
    }
  };
});

jest.mock('../../src/models/Artist', () => {
  return {
    __esModule: true,
    default: {
      find: jest.fn()
    }
  };
});

const MockedRoleType = jest.mocked(RoleType);
const MockedCompany = jest.mocked(Company);
const MockedArtist = jest.mocked(Artist);

describe('LookupController - Error Handling', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;

  beforeEach(() => {
    mockRequest = {
      query: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    jest.clearAllMocks();
  });

  describe('getRoleTypes - error handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockSort = jest.fn().mockRejectedValue(new Error('Database connection failed'));
      MockedRoleType.find = jest.fn().mockReturnValue({ sort: mockSort }) as any;

      await lookupController.getRoleTypes(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch role types',
        error: 'Database connection failed'
      });
    });

    it('should return 500 when RoleType.find throws', async () => {
      MockedRoleType.find = jest.fn().mockImplementation(() => {
        throw new Error('Unexpected error');
      }) as any;

      await lookupController.getRoleTypes(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          success: false,
          message: 'Failed to fetch role types'
        })
      );
    });
  });

  describe('getCompanies - error handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockChain = {
        populate: jest.fn().mockReturnThis(),
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockRejectedValue(new Error('Company query failed'))
      };
      MockedCompany.find = jest.fn().mockReturnValue(mockChain) as any;

      await lookupController.getCompanies(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch companies',
        error: 'Company query failed'
      });
    });
  });

  describe('getArtists - error handling', () => {
    it('should return 500 when database query fails', async () => {
      const mockChain = {
        sort: jest.fn().mockReturnThis(),
        limit: jest.fn().mockRejectedValue(new Error('Artist query failed'))
      };
      MockedArtist.find = jest.fn().mockReturnValue(mockChain) as any;

      await lookupController.getArtists(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to fetch artists',
        error: 'Artist query failed'
      });
    });
  });
});
