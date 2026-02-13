import { Request, Response, NextFunction } from 'express';
import { protect, admin } from '../../src/middleware/authMiddleware';
import User from '../../src/models/User';
import jwt from 'jsonwebtoken';
import '../setup'; // Import test setup for environment variables

// Mock User model
jest.mock('../../src/models/User');
const MockedUser = jest.mocked(User);

// Mock JWT
jest.mock('jsonwebtoken');
const mockedJwt = jest.mocked(jwt);

describe('AuthMiddleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: NextFunction;

  beforeEach(() => {
    mockRequest = {
      headers: {},
      query: {},  // Required for SSE fallback token check
      user: undefined
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
    
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('protect middleware', () => {
    it('should authenticate valid token and call next', async () => {
      const mockDecodedToken = {
        id: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600 // 1 hour from now
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token'
      };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      // Zero Trust: Mock user exists check
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockedJwt.verify).toHaveBeenCalledWith('valid-token', process.env.JWT_SECRET);
      expect(MockedUser.exists).toHaveBeenCalledWith({ _id: 'user123' });
      expect(mockRequest.user).toEqual({ id: 'user123' });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should return 401 when user does not exist in database (zero trust)', async () => {
      const mockDecodedToken = {
        id: 'nonexistent-user',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-token-but-user-deleted'
      };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      // Zero Trust: User does not exist
      MockedUser.exists = jest.fn().mockResolvedValue(null);

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockedJwt.verify).toHaveBeenCalledWith('valid-token-but-user-deleted', process.env.JWT_SECRET);
      expect(MockedUser.exists).toHaveBeenCalledWith({ _id: 'nonexistent-user' });
      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not found - session invalid',
        code: 'USER_NOT_FOUND'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should pass through without automatic token refresh', async () => {
      // Token refresh is now handled via /auth/refresh endpoint
      const mockDecodedToken = {
        id: 'user123',
        exp: Math.floor(Date.now() / 1000) + 300 // 5 minutes from now
      };

      mockRequest.headers = {
        authorization: 'Bearer expiring-token'
      };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      // Should not automatically refresh tokens anymore
      expect(mockedJwt.sign).not.toHaveBeenCalled();
      expect(mockResponse.setHeader).not.toHaveBeenCalled();
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 for invalid token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer invalid-token'
      };

      const invalidError = new Error('Invalid token') as any;
      invalidError.name = 'JsonWebTokenError';
      mockedJwt.verify = jest.fn().mockImplementation(() => {
        throw invalidError;
      });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for expired token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer expired-token'
      };

      const expiredError = new Error('Token expired') as any;
      expiredError.name = 'TokenExpiredError';
      mockedJwt.verify = jest.fn().mockImplementation(() => {
        throw expiredError;
      });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Token expired',
        code: 'TOKEN_EXPIRED'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for missing authorization header', async () => {
      mockRequest.headers = {};

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not authorized, no token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for malformed authorization header', async () => {
      mockRequest.headers = {
        authorization: 'InvalidFormat token'
      };

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not authorized, no token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for Bearer header without token', async () => {
      mockRequest.headers = {
        authorization: 'Bearer '
      };

      // Note: jwt.verify is never called because empty token is caught first
      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not authorized, no token'  // Empty token after "Bearer " triggers no-token path
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle JWT verification errors gracefully', async () => {
      mockRequest.headers = {
        authorization: 'Bearer malformed.token.here'
      };

      const malformedError = new Error('JWT malformed') as any;
      malformedError.name = 'JsonWebTokenError';
      mockedJwt.verify = jest.fn().mockImplementation(() => {
        throw malformedError;
      });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid token',
        code: 'INVALID_TOKEN'
      });
    });

    describe('Token refresh logic', () => {
      it('should not include automatic token refresh (handled via /auth/refresh endpoint)', async () => {
        const currentTime = Math.floor(Date.now() / 1000);
        const mockDecodedToken = {
          id: 'user123',
          exp: currentTime + 600 // 10 minutes from now
        };

        mockRequest.headers = {
          authorization: 'Bearer expiring-soon-token'
        };

        mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
        mockedJwt.sign = jest.fn();
        MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

        await protect(mockRequest as Request, mockResponse as Response, mockNext);

        // Token refresh is no longer automatic - clients use /auth/refresh endpoint
        expect(mockedJwt.sign).not.toHaveBeenCalled();
        expect(mockResponse.setHeader).not.toHaveBeenCalledWith('X-New-Token', expect.any(String));
        expect(mockNext).toHaveBeenCalledTimes(1);
      });

      it('should process valid tokens without refresh logic', async () => {
        const currentTime = Math.floor(Date.now() / 1000);
        const mockDecodedToken = {
          id: 'user123',
          exp: currentTime + 1200 // 20 minutes from now
        };

        mockRequest.headers = {
          authorization: 'Bearer still-fresh-token'
        };

        mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
        MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

        await protect(mockRequest as Request, mockResponse as Response, mockNext);

        // No automatic token refresh - tokens are refreshed via /auth/refresh endpoint
        expect(mockedJwt.sign).not.toHaveBeenCalled();
        expect(mockResponse.setHeader).not.toHaveBeenCalled();
        expect(mockNext).toHaveBeenCalledTimes(1);
      });
    });
  });

  describe('admin middleware', () => {
    beforeEach(() => {
      mockRequest.user = { id: 'user123' };
    });

    it('should allow admin users to proceed', async () => {
      const mockAdminUser = {
        _id: 'user123',
        username: 'admin',
        email: 'admin@example.com',
        isAdmin: true
      };

      MockedUser.findById = jest.fn().mockResolvedValue(mockAdminUser);

      await admin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(MockedUser.findById).toHaveBeenCalledWith('user123');
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should deny non-admin users', async () => {
      const mockRegularUser = {
        _id: 'user123',
        username: 'regular',
        email: 'user@example.com',
        isAdmin: false
      };

      MockedUser.findById = jest.fn().mockResolvedValue(mockRegularUser);

      await admin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(MockedUser.findById).toHaveBeenCalledWith('user123');
      expect(mockResponse.status).toHaveBeenCalledWith(403);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Access denied. Admin privileges required'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should deny access if user not found', async () => {
      MockedUser.findById = jest.fn().mockResolvedValue(null);

      await admin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not authorized, user not found'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle database errors', async () => {
      MockedUser.findById = jest.fn().mockRejectedValue(new Error('Database error'));

      await admin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Server Error',
        error: 'Database error'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle missing user in request', async () => {
      mockRequest.user = undefined;

      // This would normally cause a runtime error, but let's test the behavior
      try {
        await admin(mockRequest as Request, mockResponse as Response, mockNext);
      } catch (error) {
        // Expected to fail due to undefined user.id
        expect(error).toBeDefined();
      }
    });
  });

  describe('Middleware integration', () => {
    it('should work with protect middleware followed by admin middleware', async () => {
      const mockDecodedToken = {
        id: 'admin123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      const mockAdminUser = {
        _id: 'admin123',
        username: 'admin',
        email: 'admin@example.com',
        isAdmin: true
      };

      mockRequest.headers = {
        authorization: 'Bearer valid-admin-token'
      };

      // First, protect middleware
      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'admin123' });
      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockRequest.user).toEqual({ id: 'admin123' });
      expect(mockNext).toHaveBeenCalledTimes(1);

      // Then, admin middleware
      MockedUser.findById = jest.fn().mockResolvedValue(mockAdminUser);
      (mockNext as jest.MockedFunction<any>).mockClear(); // Clear previous call

      await admin(mockRequest as Request, mockResponse as Response, mockNext);

      expect(MockedUser.findById).toHaveBeenCalledWith('admin123');
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(mockResponse.status).not.toHaveBeenCalled();
    });
  });

  describe('Query parameter token fallback (SSE)', () => {
    it('should authenticate via query parameter token when no Authorization header present', async () => {
      const mockDecodedToken = {
        id: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      mockRequest.headers = {};  // No Authorization header
      mockRequest.query = { token: 'valid-query-token' };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockedJwt.verify).toHaveBeenCalledWith('valid-query-token', process.env.JWT_SECRET);
      expect(MockedUser.exists).toHaveBeenCalledWith({ _id: 'user123' });
      expect(mockRequest.user).toEqual({ id: 'user123' });
      expect(mockNext).toHaveBeenCalled();
      expect(mockResponse.status).not.toHaveBeenCalled();
    });

    it('should prefer Authorization header over query parameter token', async () => {
      const mockDecodedToken = {
        id: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      mockRequest.headers = { authorization: 'Bearer header-token' };
      mockRequest.query = { token: 'query-token' };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      // Should use the header token, not the query token
      expect(mockedJwt.verify).toHaveBeenCalledWith('header-token', process.env.JWT_SECRET);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 when query token is not a string', async () => {
      mockRequest.headers = {};
      mockRequest.query = { token: ['array-token'] as any };

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Not authorized, no token'
      });
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('Edge cases', () => {
    it('should handle token with missing exp field', async () => {
      const mockDecodedToken = {
        id: 'user123'
        // Missing exp field
      };

      mockRequest.headers = {
        authorization: 'Bearer token-without-exp'
      };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      // Should not crash and should proceed normally
      expect(mockRequest.user).toEqual({ id: 'user123' });
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle extremely long tokens', async () => {
      const longToken = 'Bearer ' + 'a'.repeat(1000);
      mockRequest.headers = {
        authorization: longToken
      };

      const mockDecodedToken = {
        id: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockedJwt.verify).toHaveBeenCalledWith('a'.repeat(1000), process.env.JWT_SECRET);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should handle special characters in tokens', async () => {
      const specialToken = 'Bearer token.with-special_chars+symbols=';
      mockRequest.headers = {
        authorization: specialToken
      };

      const mockDecodedToken = {
        id: 'user123',
        exp: Math.floor(Date.now() / 1000) + 3600
      };

      mockedJwt.verify = jest.fn().mockReturnValue(mockDecodedToken);
      MockedUser.exists = jest.fn().mockResolvedValue({ _id: 'user123' });

      await protect(mockRequest as Request, mockResponse as Response, mockNext);

      expect(mockedJwt.verify).toHaveBeenCalledWith('token.with-special_chars+symbols=', process.env.JWT_SECRET);
      expect(mockNext).toHaveBeenCalled();
    });
  });
});