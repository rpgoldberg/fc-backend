import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Figure from '../models/Figure';
import { createLogger } from '../utils/logger';

const logger = createLogger('EXPORT');

/**
 * Escape a CSV field value.
 * Wraps in double quotes if the value contains commas, quotes, or newlines.
 * Existing double quotes are escaped by doubling them.
 */
export function escapeCsvField(value: any): string {
  if (value == null) return '';
  const str = String(value);
  if (str.includes(',') || str.includes('"') || str.includes('\n')) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Build a filter object for the collection query.
 * Always scoped to the authenticated user. Optionally filtered by collectionStatus.
 */
function buildCollectionFilter(userId: mongoose.Types.ObjectId, status?: string) {
  const validStatuses = ['owned', 'ordered', 'wished'];
  const filter: Record<string, any> = { userId };

  if (status && validStatuses.includes(status)) {
    filter.collectionStatus = status;
  }

  return filter;
}

/**
 * GET /export/collection/csv
 * Downloads the authenticated user's figure collection as a CSV file.
 * Optional query param: ?status=owned|ordered|wished
 */
export const exportCollectionCsv = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    let userObjectId: mongoose.Types.ObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(req.user.id);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid user identifier',
      });
    }

    const status = req.query.status as string | undefined;
    const filter = buildCollectionFilter(userObjectId, status);

    const figures = await Figure.find(filter).lean();

    const headers = [
      'Name', 'Manufacturer', 'Origin', 'Category', 'Scale',
      'Status', 'MFC ID', 'Image URL', 'Release Date', 'Price',
      'Currency', 'Materials', 'JAN Code', 'Notes', 'Date Added',
    ];

    const rows = figures.map((f: any) => [
      escapeCsvField(f.name),
      escapeCsvField(f.manufacturer),
      escapeCsvField(f.origin),
      escapeCsvField(f.category),
      escapeCsvField(f.scale),
      f.collectionStatus || '',
      f.mfcId != null ? String(f.mfcId) : '',
      f.imageUrl || '',
      f.releases?.[0]?.date ? new Date(f.releases[0].date).toISOString().split('T')[0] : '',
      f.releases?.[0]?.price != null ? String(f.releases[0].price) : '',
      f.releases?.[0]?.currency || '',
      escapeCsvField(f.materials),
      f.jan || '',
      escapeCsvField(f.note),
      f.createdAt ? new Date(f.createdAt).toISOString().split('T')[0] : '',
    ]);

    const csv = [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="collection-${Date.now()}.csv"`);
    return res.send(csv);
  } catch (error: any) {
    logger.error('Error exporting collection as CSV:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to export collection',
    });
  }
};

/**
 * GET /export/collection/json
 * Downloads the authenticated user's figure collection as a JSON file.
 * Optional query param: ?status=owned|ordered|wished
 */
export const exportCollectionJson = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    let userObjectId: mongoose.Types.ObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(req.user.id);
    } catch {
      return res.status(400).json({
        success: false,
        message: 'Invalid user identifier',
      });
    }

    const status = req.query.status as string | undefined;
    const filter = buildCollectionFilter(userObjectId, status);

    const figures = await Figure.find(filter).lean();

    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Content-Disposition', `attachment; filename="collection-${Date.now()}.json"`);
    return res.json({
      exportedAt: new Date().toISOString(),
      count: figures.length,
      figures,
    });
  } catch (error: any) {
    logger.error('Error exporting collection as JSON:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Failed to export collection',
    });
  }
};
