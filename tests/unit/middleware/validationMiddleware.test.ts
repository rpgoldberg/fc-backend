import { Request, Response, NextFunction } from 'express';
import { validateRequest, validateContentType, validateObjectId, globalErrorHandler, schemas } from '../../../src/middleware/validationMiddleware';
import mongoose from 'mongoose';
import Joi from 'joi';

describe('Validation Middleware', () => {
  describe('validateRequest', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.MockedFunction<NextFunction>;

    beforeEach(() => {
      mockReq = { body: {} };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    it('should pass validation for valid figure payload', () => {
      const validFigure = {
        name: 'Spider-Man Figure',
        manufacturer: 'Marvel Legends',
        type: 'action figure'
      };

      mockReq.body = validFigure;
      const middleware = validateRequest(schemas.figure);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should fail validation for invalid figure payload', () => {
      const invalidFigure = {
        name: 'A', // too short
        manufacturer: '', // empty string
        type: 'invalid type' // not in allowed types
      };

      mockReq.body = invalidFigure;
      const middleware = validateRequest(schemas.figure);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Validation Error',
        errors: expect.arrayContaining([
          expect.objectContaining({ path: ['name'] }),
          // Schema v3: manufacturer is now optional
          expect.objectContaining({ path: ['type'] })
        ])
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject unknown properties by default', () => {
      const figureWithUnknownProps = {
        name: 'Test Figure',
        manufacturer: 'Test Company',
        unknownProp: 'Extra Data'
      };

      mockReq.body = figureWithUnknownProps;
      const middleware = validateRequest(schemas.figure);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Validation Error'
      }));
    });
  });

  describe('validateContentType', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.MockedFunction<NextFunction>;

    beforeEach(() => {
      mockReq = { 
        headers: { 'content-type': 'application/json' } 
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    it('should pass when content type is allowed', () => {
      const middleware = validateContentType(['application/json']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject when content type is not allowed', () => {
      const middleware = validateContentType(['application/xml']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(415);
      expect(mockRes.json).toHaveBeenCalledWith({
        message: 'Unsupported Media Type',
        allowedTypes: ['application/xml']
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject when no content type is provided', () => {
      mockReq.headers = {};
      const middleware = validateContentType(['application/json']);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(415);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('validateObjectId', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.MockedFunction<NextFunction>;

    beforeEach(() => {
      const validObjectId = new mongoose.Types.ObjectId();
      mockReq = { 
        params: { id: validObjectId.toString() } 
      };
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
    });

    it('should pass for valid ObjectId', () => {
      const middleware = validateObjectId();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(mockRes.status).not.toHaveBeenCalled();
    });

    it('should reject when id is missing', () => {
      mockReq.params = {};
      const middleware = validateObjectId();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Validation Error',
        errors: [expect.objectContaining({ 
          message: 'id parameter is required' 
        })]
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid ObjectId', () => {
      mockReq.params = { id: 'invalid-id' };
      const middleware = validateObjectId();
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Validation Error',
        errors: [expect.objectContaining({ 
          message: 'Invalid id format' 
        })]
      }));
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('globalErrorHandler', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: jest.MockedFunction<NextFunction>;
    let consoleSpy: jest.SpyInstance;

    beforeEach(() => {
      mockReq = {};
      mockRes = {
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };
      mockNext = jest.fn();
      consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should handle Mongoose CastError for invalid ObjectId', () => {
      const castError = new Error('Cast to ObjectId failed');
      castError.name = 'CastError';

      globalErrorHandler(castError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Validation Error',
        errors: [{ message: 'Invalid ID format', path: ['id'] }]
      }));
    });

    it('should handle Mongoose ValidationError', () => {
      const validationError = new Error('Validation failed');
      validationError.name = 'ValidationError';
      (validationError as any).errors = {
        name: { message: 'Name is required', path: 'name' }
      };

      globalErrorHandler(validationError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(422);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Validation Error',
        errors: [{ 
          message: 'Name is required', 
          path: ['name'] 
        }]
      }));
    });

    it('should handle JSON parsing errors', () => {
      const jsonError = new SyntaxError('Unexpected token in JSON');
      jsonError.name = 'SyntaxError';
      jsonError.message = 'JSON parse error';

      globalErrorHandler(jsonError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Invalid JSON format'
      }));
    });

    it('should handle unhandled errors with 500 status', () => {
      const unknownError = new Error('Unknown server error');

      globalErrorHandler(unknownError, mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith(expect.objectContaining({
        message: 'Internal Server Error'
      }));
    });
  });

  describe('Validation Schemas', () => {
    describe('Figure Schema', () => {
      const { figure } = schemas;

      it('should validate figure with all optional fields', () => {
        const validFigure = {
          name: 'Detailed Figure',
          manufacturer: 'Test Manufacturer',
          type: 'action figure',
          description: 'A detailed collectible',
          purchaseInfo: {
            price: 49.99,
            date: new Date(),
            source: 'Collector Store'
          }
        };

        const { error } = figure.validate(validFigure);
        expect(error).toBeUndefined();
      });

      it('should reject figure with invalid type', () => {
        const invalidFigure = {
          name: 'Invalid Figure',
          manufacturer: 'Test Manufacturer',
          type: 'invalid-type'
        };

        const { error } = figure.validate(invalidFigure);
        expect(error).toBeDefined();
        expect(error?.details[0].path).toContain('type');
      });
    });

    describe('User Schema', () => {
      const { user } = schemas;

      it('should validate strong password', () => {
        const validUser = {
          email: 'test@example.com',
          username: 'testuser123',
          password: 'Str0ng!Pass'
        };

        const { error } = user.validate(validUser);
        expect(error).toBeUndefined();
      });

      it('should reject weak passwords', () => {
        const weakPasswords = [
          { 
            email: 'test@example.com', 
            username: 'testuser', 
            password: 'weak' 
          },
          {
            email: 'test@example.com', 
            username: 'testuser', 
            password: 'short1' 
          }
        ];

        weakPasswords.forEach(userData => {
          const { error } = user.validate(userData);
          expect(error).toBeDefined();
          expect(error?.details[0].path).toContain('password');
        });
      });

      it('should reject invalid email domains', () => {
        const invalidUser = {
          email: 'test@invalid.xyz',
          username: 'testuser',
          password: 'Str0ng!Pass'
        };

        const { error } = user.validate(invalidUser);
        expect(error).toBeDefined();
        expect(error?.details[0].path).toContain('email');
      });
    });

    describe('Pagination Schema', () => {
      const { pagination } = schemas;

      it('should validate valid pagination parameters', () => {
        const validPagination = { page: 2, limit: 20 };
        const { error } = pagination.validate(validPagination);
        expect(error).toBeUndefined();
      });

      it('should set default values when not provided', () => {
        const { value, error } = pagination.validate({});
        expect(error).toBeUndefined();
        expect(value.page).toBe(1);
        expect(value.limit).toBe(10);
      });

      it('should reject invalid pagination parameters', () => {
        const invalidPaginations = [
          { page: 0 },
          { limit: 0 },
          { limit: 101 }
        ];

        invalidPaginations.forEach(params => {
          const { error } = pagination.validate(params);
          expect(error).toBeDefined();
        });
      });
    });
  });
});