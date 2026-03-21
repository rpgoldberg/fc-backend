import { Request, Response } from 'express';
import mongoose from 'mongoose';
import Figure from '../models/Figure';
import PriceWatchlist from '../models/PriceWatchlist';
import PriceAlert from '../models/PriceAlert';
import { createLogger } from '../utils/logger';

const logger = createLogger('ANALYTICS');

/** Default stats returned when a user has no figures */
const DEFAULT_COLLECTION_STATS = {
  totalFigures: 0,
  owned: 0,
  ordered: 0,
  wished: 0,
  totalValue: 0,
  manufacturers: [] as string[],
  scales: [] as string[],
  oldestAdded: null,
  newestAdded: null,
};

/** Allowed groupBy values for the breakdown endpoint */
const ALLOWED_GROUP_BY = ['manufacturer', 'scale', 'origin', 'category'] as const;
type GroupByField = typeof ALLOWED_GROUP_BY[number];

/**
 * GET /analytics/collection
 * Returns aggregate collection statistics for the authenticated user.
 */
export const getCollectionAnalytics = async (req: Request, res: Response) => {
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

    const stats = await Figure.aggregate([
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: null,
          totalFigures: { $sum: 1 },
          owned: {
            $sum: {
              $cond: [
                { $or: [
                  { $eq: ['$collectionStatus', 'owned'] },
                  { $eq: [{ $ifNull: ['$collectionStatus', 'owned'] }, 'owned'] },
                ] },
                1,
                0,
              ],
            },
          },
          ordered: {
            $sum: { $cond: [{ $eq: ['$collectionStatus', 'ordered'] }, 1, 0] },
          },
          wished: {
            $sum: { $cond: [{ $eq: ['$collectionStatus', 'wished'] }, 1, 0] },
          },
          totalValue: {
            $sum: { $ifNull: ['$purchaseInfo.price', 0] },
          },
          manufacturers: { $addToSet: '$manufacturer' },
          scales: { $addToSet: '$scale' },
          oldestAdded: { $min: '$createdAt' },
          newestAdded: { $max: '$createdAt' },
        },
      },
    ]);

    const result = stats[0] || DEFAULT_COLLECTION_STATS;
    // Remove the _id: null field from aggregation result
    if (result._id === null) {
      delete result._id;
    }

    // Filter out null/undefined values from addToSet results
    if (result.manufacturers) {
      result.manufacturers = result.manufacturers.filter((m: string | null) => m != null);
    }
    if (result.scales) {
      result.scales = result.scales.filter((s: string | null) => s != null);
    }

    res.json({ success: true, analytics: result });
  } catch (error: any) {
    logger.error('Error fetching collection analytics:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /analytics/collection/breakdown
 * Detailed breakdown by manufacturer, scale, origin, or category.
 * Query param: ?groupBy=manufacturer
 */
export const getCollectionBreakdown = async (req: Request, res: Response) => {
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

    const groupBy = req.query.groupBy as string | undefined;

    if (!groupBy || !ALLOWED_GROUP_BY.includes(groupBy as GroupByField)) {
      return res.status(400).json({
        success: false,
        message: `Invalid groupBy parameter. Must be one of: ${ALLOWED_GROUP_BY.join(', ')}`,
      });
    }

    const pipeline = [
      { $match: { userId: userObjectId } },
      {
        $group: {
          _id: { $ifNull: [`$${groupBy}`, 'Unknown'] },
          count: { $sum: 1 },
        },
      },
      { $sort: { count: -1 as const } },
      { $limit: 20 },
    ];

    const breakdown = await Figure.aggregate(pipeline);

    res.json({ success: true, groupBy, breakdown });
  } catch (error: any) {
    logger.error('Error fetching collection breakdown:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /analytics/collection/timeline
 * Collection growth over time (items added per month).
 * Query param: ?months=12 (default 12, max 60)
 */
export const getCollectionTimeline = async (req: Request, res: Response) => {
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

    const rawMonths = parseInt(req.query.months as string, 10);
    const months = isNaN(rawMonths) || rawMonths < 1 ? 12 : Math.min(rawMonths, 60);

    const cutoffDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);

    const pipeline = [
      {
        $match: {
          userId: userObjectId,
          createdAt: { $gte: cutoffDate },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          added: { $sum: 1 },
          statuses: { $push: '$collectionStatus' },
        },
      },
      { $sort: { _id: 1 as const } },
    ];

    const timeline = await Figure.aggregate(pipeline);

    res.json({ success: true, months, timeline });
  } catch (error: any) {
    logger.error('Error fetching collection timeline:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /analytics/prices/summary
 * Price tracking summary across user's watchlist.
 */
export const getPriceSummary = async (req: Request, res: Response) => {
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

    const watchlist = await PriceWatchlist.find({ userId: userObjectId });

    const summary = {
      trackedItems: watchlist.length,
      trendsUp: watchlist.filter((w) => w.trend === 'up').length,
      trendsDown: watchlist.filter((w) => w.trend === 'down').length,
      trendsStable: watchlist.filter((w) => w.trend === 'stable').length,
      alertsActive: 0,
    };

    const alertCount = await PriceAlert.countDocuments({
      userId: userObjectId,
      active: true,
    });
    summary.alertsActive = alertCount;

    res.json({ success: true, summary });
  } catch (error: any) {
    logger.error('Error fetching price summary:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};

/**
 * GET /analytics/collection/value-history
 * Track total collection value over time using purchase prices, grouped by month.
 */
export const getValueHistory = async (req: Request, res: Response) => {
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

    const rawMonths = parseInt(req.query.months as string, 10);
    const months = isNaN(rawMonths) || rawMonths < 1 ? 12 : Math.min(rawMonths, 60);

    const cutoffDate = new Date(Date.now() - months * 30 * 24 * 60 * 60 * 1000);

    // Group figures by the month they were added and compute cumulative value
    const pipeline = [
      {
        $match: {
          userId: userObjectId,
          createdAt: { $gte: cutoffDate },
          'purchaseInfo.price': { $exists: true, $gt: 0 },
        },
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
          monthlyValue: { $sum: '$purchaseInfo.price' },
          itemsAdded: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 as const } },
    ];

    const valueHistory = await Figure.aggregate(pipeline);

    res.json({ success: true, months, valueHistory });
  } catch (error: any) {
    logger.error('Error fetching value history:', error.message);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};
