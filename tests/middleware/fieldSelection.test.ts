import { Request, Response, NextFunction } from 'express';
import { fieldSelection } from '../../src/middleware/fieldSelection';
import '../setup';

describe('fieldSelection middleware', () => {
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

  it('should call next without setting projection when fields param is missing', () => {
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).fieldProjection).toBeUndefined();
  });

  it('should parse comma-separated fields into a projection', () => {
    mockRequest.query = { fields: 'name,manufacturer,scale' };
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).fieldProjection).toEqual({
      _id: 1,
      name: 1,
      manufacturer: 1,
      scale: 1
    });
  });

  it('should always include _id in the projection', () => {
    mockRequest.query = { fields: 'name' };
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).fieldProjection).toHaveProperty('_id', 1);
  });

  it('should filter against allowedFields when specified', () => {
    mockRequest.query = { fields: 'name,manufacturer,secretField,password' };
    const middleware = fieldSelection(['name', 'manufacturer', 'scale']);
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).fieldProjection).toEqual({
      _id: 1,
      name: 1,
      manufacturer: 1
    });
    // secretField and password should not be in projection
    expect((mockRequest as any).fieldProjection).not.toHaveProperty('secretField');
    expect((mockRequest as any).fieldProjection).not.toHaveProperty('password');
  });

  it('should allow all fields when allowedFields is not specified', () => {
    mockRequest.query = { fields: 'name,anyField,anotherField' };
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).fieldProjection).toEqual({
      _id: 1,
      name: 1,
      anyField: 1,
      anotherField: 1
    });
  });

  it('should handle empty fields param gracefully', () => {
    mockRequest.query = { fields: '' };
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    // Empty string is falsy, so no projection is set (full objects returned)
    expect(mockNext).toHaveBeenCalled();
    expect((mockRequest as any).fieldProjection).toBeUndefined();
  });

  it('should handle whitespace-only and extra commas in fields', () => {
    mockRequest.query = { fields: ' name , , manufacturer , ' };
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).fieldProjection).toEqual({
      _id: 1,
      name: 1,
      manufacturer: 1
    });
  });

  it('should trim whitespace from field names', () => {
    mockRequest.query = { fields: '  imageUrl  ,  scale  ' };
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).fieldProjection).toEqual({
      _id: 1,
      imageUrl: 1,
      scale: 1
    });
  });

  it('should not duplicate _id if explicitly requested', () => {
    mockRequest.query = { fields: '_id,name' };
    const middleware = fieldSelection();
    middleware(mockRequest as Request, mockResponse as Response, mockNext);

    expect((mockRequest as any).fieldProjection).toEqual({
      _id: 1,
      name: 1
    });
  });
});
