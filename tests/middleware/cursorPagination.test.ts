import { Request, Response, NextFunction } from 'express';
import { cursorPagination } from '../../src/middleware/cursorPagination';
import '../setup';

describe('cursorPagination middleware', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let mockNext: jest.MockedFunction<NextFunction>;

  beforeEach(() => {
    mockRequest = {
      query: {}
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis()
    };
    mockNext = jest.fn();
  });

  it('should call next without setting cursorPagination when no cursor params present', () => {
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).cursorPagination).toBeUndefined();
  });

  it('should parse after parameter', () => {
    mockRequest.query = { after: '507f1f77bcf86cd799439011' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).cursorPagination).toEqual({
      after: '507f1f77bcf86cd799439011',
      before: undefined,
      limit: 20
    });
  });

  it('should parse before parameter', () => {
    mockRequest.query = { before: '507f1f77bcf86cd799439011' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).cursorPagination).toEqual({
      after: undefined,
      before: '507f1f77bcf86cd799439011',
      limit: 20
    });
  });

  it('should parse custom limit', () => {
    mockRequest.query = { after: 'abc123', limit: '50' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).cursorPagination.limit).toBe(50);
  });

  it('should default limit to 20 when not specified', () => {
    mockRequest.query = { after: 'abc123' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).cursorPagination.limit).toBe(20);
  });

  it('should cap limit at 100', () => {
    mockRequest.query = { after: 'abc123', limit: '500' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).cursorPagination.limit).toBe(100);
  });

  it('should default limit to 20 for invalid limit values', () => {
    mockRequest.query = { after: 'abc123', limit: 'notanumber' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).cursorPagination.limit).toBe(20);
  });

  it('should parse both after and before when both provided', () => {
    mockRequest.query = { after: 'id1', before: 'id2', limit: '10' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).cursorPagination).toEqual({
      after: 'id1',
      before: 'id2',
      limit: 10
    });
  });

  it('should not set cursorPagination when only limit is provided', () => {
    mockRequest.query = { limit: '25' };
    const middleware = cursorPagination();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).cursorPagination).toBeUndefined();
  });
});
