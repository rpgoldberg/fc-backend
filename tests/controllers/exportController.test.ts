import { Request, Response } from 'express';
import mongoose from 'mongoose';
import * as exportController from '../../src/controllers/exportController';
import Figure from '../../src/models/Figure';
import '../setup';

// Mock Figure model
jest.mock('../../src/models/Figure', () => {
  return {
    __esModule: true,
    default: {
      find: jest.fn(),
    },
  };
});
const MockedFigure = jest.mocked(Figure);

describe('ExportController', () => {
  let mockRequest: Partial<Request>;
  let mockResponse: Partial<Response>;
  let sentData: string | undefined;

  beforeEach(() => {
    sentData = undefined;
    mockRequest = {
      user: { id: '000000000000000000000123' },
      query: {},
    };
    mockResponse = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      setHeader: jest.fn().mockReturnThis(),
      send: jest.fn().mockImplementation((data: string) => {
        sentData = data;
        return mockResponse;
      }),
    };
    jest.clearAllMocks();
  });

  // ── escapeCsvField ────────────────────────────────────────────────
  describe('escapeCsvField', () => {
    it('should return empty string for null', () => {
      expect(exportController.escapeCsvField(null)).toBe('');
    });

    it('should return empty string for undefined', () => {
      expect(exportController.escapeCsvField(undefined)).toBe('');
    });

    it('should return plain string when no special characters', () => {
      expect(exportController.escapeCsvField('hello')).toBe('hello');
    });

    it('should wrap in quotes and escape commas', () => {
      expect(exportController.escapeCsvField('hello, world')).toBe('"hello, world"');
    });

    it('should escape double quotes by doubling them', () => {
      expect(exportController.escapeCsvField('say "hi"')).toBe('"say ""hi"""');
    });

    it('should wrap in quotes when newline present', () => {
      expect(exportController.escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
    });

    it('should handle combined special characters', () => {
      expect(exportController.escapeCsvField('a,"b"\nc')).toBe('"a,""b""\nc"');
    });

    it('should convert numbers to strings', () => {
      expect(exportController.escapeCsvField(42)).toBe('42');
    });
  });

  // ── exportCollectionCsv ───────────────────────────────────────────
  describe('exportCollectionCsv', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not authenticated',
      });
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID_ID' };

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid user identifier',
      });
    });

    it('should set correct Content-Type and Content-Disposition headers', async () => {
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'text/csv');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/^attachment; filename="collection-\d+\.csv"$/)
      );
    });

    it('should return CSV with headers only for empty collection', async () => {
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.send).toHaveBeenCalledWith(
        'Name,Manufacturer,Origin,Category,Scale,Status,MFC ID,Image URL,Release Date,Price,Currency,Materials,JAN Code,Notes,Date Added'
      );
    });

    it('should export figures as CSV rows', async () => {
      const figures = [
        {
          name: 'Miku',
          manufacturer: 'GSC',
          origin: 'Vocaloid',
          category: 'Scale',
          scale: '1/8',
          collectionStatus: 'owned',
          mfcId: 12345,
          imageUrl: 'https://example.com/img.jpg',
          releases: [{ date: new Date('2024-01-15'), price: 15000, currency: 'JPY' }],
          materials: 'PVC, ABS',
          jan: '4580416940123',
          note: 'First figure',
          createdAt: new Date('2024-06-01'),
        },
      ];
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(figures) } as any);

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      const csv = sentData!;
      const lines = csv.split('\n');
      expect(lines).toHaveLength(2); // header + 1 row
      expect(lines[0]).toContain('Name,Manufacturer');
      expect(lines[1]).toContain('Miku');
      expect(lines[1]).toContain('GSC');
      expect(lines[1]).toContain('Vocaloid');
      expect(lines[1]).toContain('Scale');
      expect(lines[1]).toContain('1/8');
      expect(lines[1]).toContain('owned');
      expect(lines[1]).toContain('12345');
      expect(lines[1]).toContain('2024-01-15');
      expect(lines[1]).toContain('15000');
      expect(lines[1]).toContain('JPY');
      expect(lines[1]).toContain('"PVC, ABS"'); // escaped because of comma
      expect(lines[1]).toContain('4580416940123');
      expect(lines[1]).toContain('First figure');
      expect(lines[1]).toContain('2024-06-01');
    });

    it('should properly escape CSV fields with commas and quotes', async () => {
      const figures = [
        {
          name: 'Figure "Special"',
          manufacturer: 'Company, Inc.',
          origin: null,
          category: null,
          scale: null,
          collectionStatus: 'owned',
          releases: [],
          createdAt: new Date('2024-01-01'),
        },
      ];
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(figures) } as any);

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      const csv = sentData!;
      const lines = csv.split('\n');
      // Name field: "Figure ""Special"""  (quotes escaped)
      expect(lines[1]).toContain('"Figure ""Special"""');
      // Manufacturer field: "Company, Inc."  (comma escaped)
      expect(lines[1]).toContain('"Company, Inc."');
    });

    it('should filter by collection status when provided', async () => {
      mockRequest.query = { status: 'wished' };
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      const expectedUserId = new mongoose.Types.ObjectId('000000000000000000000123');
      expect(MockedFigure.find).toHaveBeenCalledWith({
        userId: expectedUserId,
        collectionStatus: 'wished',
      });
    });

    it('should ignore invalid status values', async () => {
      mockRequest.query = { status: 'invalid_status' };
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      const expectedUserId = new mongoose.Types.ObjectId('000000000000000000000123');
      expect(MockedFigure.find).toHaveBeenCalledWith({
        userId: expectedUserId,
      });
    });

    it('should return 500 when database query fails', async () => {
      MockedFigure.find.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('DB error')),
      } as any);

      await exportController.exportCollectionCsv(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to export collection',
      });
    });
  });

  // ── exportCollectionJson ──────────────────────────────────────────
  describe('exportCollectionJson', () => {
    it('should return 401 when user is not authenticated', async () => {
      mockRequest.user = undefined;

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(401);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'User not authenticated',
      });
    });

    it('should return 400 for invalid userId', async () => {
      mockRequest.user = { id: 'INVALID_ID' };

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(400);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Invalid user identifier',
      });
    });

    it('should set correct Content-Type and Content-Disposition headers', async () => {
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.setHeader).toHaveBeenCalledWith('Content-Type', 'application/json');
      expect(mockResponse.setHeader).toHaveBeenCalledWith(
        'Content-Disposition',
        expect.stringMatching(/^attachment; filename="collection-\d+\.json"$/)
      );
    });

    it('should return structured JSON with exportedAt, count, and figures', async () => {
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          exportedAt: expect.any(String),
          count: 0,
          figures: [],
        })
      );
    });

    it('should include figures in JSON export', async () => {
      const figures = [
        { name: 'Miku', manufacturer: 'GSC', collectionStatus: 'owned' },
        { name: 'Rin', manufacturer: 'Alter', collectionStatus: 'wished' },
      ];
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue(figures) } as any);

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.json).toHaveBeenCalledWith(
        expect.objectContaining({
          count: 2,
          figures,
        })
      );
    });

    it('should filter by collection status when provided', async () => {
      mockRequest.query = { status: 'ordered' };
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      const expectedUserId = new mongoose.Types.ObjectId('000000000000000000000123');
      expect(MockedFigure.find).toHaveBeenCalledWith({
        userId: expectedUserId,
        collectionStatus: 'ordered',
      });
    });

    it('should ignore invalid status values', async () => {
      mockRequest.query = { status: 'bogus' };
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      const expectedUserId = new mongoose.Types.ObjectId('000000000000000000000123');
      expect(MockedFigure.find).toHaveBeenCalledWith({
        userId: expectedUserId,
      });
    });

    it('should return valid ISO 8601 exportedAt timestamp', async () => {
      MockedFigure.find.mockReturnValue({ lean: jest.fn().mockResolvedValue([]) } as any);

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      const call = (mockResponse.json as jest.Mock).mock.calls[0][0];
      // Validate it's a valid ISO date
      expect(new Date(call.exportedAt).toISOString()).toBe(call.exportedAt);
    });

    it('should return 500 when database query fails', async () => {
      MockedFigure.find.mockReturnValue({
        lean: jest.fn().mockRejectedValue(new Error('DB error')),
      } as any);

      await exportController.exportCollectionJson(mockRequest as Request, mockResponse as Response);

      expect(mockResponse.status).toHaveBeenCalledWith(500);
      expect(mockResponse.json).toHaveBeenCalledWith({
        success: false,
        message: 'Failed to export collection',
      });
    });
  });
});
