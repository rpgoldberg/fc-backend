import { Request, Response } from 'express';
import mongoose from 'mongoose';
import PriceRecord from '../models/PriceRecord';
import PriceAlert from '../models/PriceAlert';
import PriceWatchlist from '../models/PriceWatchlist';
import { getCurrencyService } from '../services/currencyService';
import { createLogger } from '../utils/logger';

const logger = createLogger('PRICE');

// ─── Price History ───────────────────────────────────────────────────────────

/**
 * GET /prices/:figureId/history
 * Returns price history for a figure across all (or filtered) sites.
 * Query params: ?site=akimomo&period=30d&currency=USD
 */
export const getPriceHistory = async (req: Request, res: Response) => {
  try {
    const { figureId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(figureId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid figureId format', path: ['figureId'] }]
      });
    }

    const site = req.query.site as string | undefined;
    const period = req.query.period as string | undefined;

    // Build query
    const query: Record<string, any> = {
      figureId: new mongoose.Types.ObjectId(figureId)
    };

    if (site) {
      query.site = site;
    }

    // Parse period (e.g., "7d", "30d", "90d", "1y")
    if (period) {
      const match = period.match(/^(\d+)(d|m|y)$/);
      if (match) {
        const amount = parseInt(match[1], 10);
        const unit = match[2];
        const now = new Date();
        let startDate: Date;

        switch (unit) {
          case 'd':
            startDate = new Date(now.getTime() - amount * 24 * 60 * 60 * 1000);
            break;
          case 'm':
            startDate = new Date(now);
            startDate.setMonth(startDate.getMonth() - amount);
            break;
          case 'y':
            startDate = new Date(now);
            startDate.setFullYear(startDate.getFullYear() - amount);
            break;
          default:
            startDate = new Date(0);
        }

        query.observedAt = { $gte: startDate };
      }
    }

    const records = await PriceRecord.find(query)
      .sort({ observedAt: -1 })
      .limit(1000)
      .lean();

    return res.status(200).json({
      success: true,
      count: records.length,
      data: records
    });
  } catch (error: any) {
    logger.error('Error fetching price history:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching price history'
    });
  }
};

/**
 * GET /prices/:figureId/current
 * Returns the latest price per site for a given figure.
 */
export const getCurrentPrices = async (req: Request, res: Response) => {
  try {
    const { figureId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(figureId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid figureId format', path: ['figureId'] }]
      });
    }

    // Aggregate to get latest price per site
    const latestPrices = await PriceRecord.aggregate([
      { $match: { figureId: new mongoose.Types.ObjectId(figureId) } },
      { $sort: { observedAt: -1 } },
      {
        $group: {
          _id: '$site',
          latestRecord: { $first: '$$ROOT' }
        }
      },
      { $replaceRoot: { newRoot: '$latestRecord' } },
      { $sort: { priceUsd: 1 } } // Sort by price ascending (cheapest first)
    ]);

    return res.status(200).json({
      success: true,
      count: latestPrices.length,
      data: latestPrices
    });
  } catch (error: any) {
    logger.error('Error fetching current prices:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching current prices'
    });
  }
};

// ─── Price Recording (Service Auth - called by scraper) ──────────────────────

/**
 * POST /prices/record
 * Record a single price observation (called by scraper service).
 */
export const recordPrice = async (req: Request, res: Response) => {
  try {
    const {
      figureId, site, sourceUrl, price, currency,
      priceUsd, stockStatus, shippingCost, shippingCurrency,
      isResale, scrapeSessionId, observedAt, metadata
    } = req.body;

    if (!figureId || !site || !sourceUrl || price == null || !currency) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: figureId, site, sourceUrl, price, currency'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(figureId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid figureId format', path: ['figureId'] }]
      });
    }

    // Auto-calculate priceUsd if not provided
    let resolvedPriceUsd = priceUsd;
    if (resolvedPriceUsd == null) {
      try {
        const currencyService = getCurrencyService();
        resolvedPriceUsd = currencyService.convertToUsd(price, currency);
      } catch (err: any) {
        logger.warn(`Currency conversion failed for ${currency}: ${err.message}. priceUsd required.`);
        return res.status(400).json({
          success: false,
          message: `Cannot auto-convert currency ${currency} to USD: ${err.message}. Provide priceUsd explicitly.`
        });
      }
    }

    const record = new PriceRecord({
      figureId,
      site,
      sourceUrl,
      price,
      currency,
      priceUsd: resolvedPriceUsd,
      stockStatus: stockStatus || 'unknown',
      shippingCost,
      shippingCurrency,
      isResale: isResale || false,
      scrapeSessionId,
      observedAt: observedAt || new Date(),
      metadata
    });

    const savedRecord = await record.save();

    return res.status(201).json({
      success: true,
      data: savedRecord
    });
  } catch (error: any) {
    logger.error('Error recording price:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while recording price'
    });
  }
};

/**
 * POST /prices/record-batch
 * Record multiple price observations at once (called by scraper service).
 */
export const recordPriceBatch = async (req: Request, res: Response) => {
  try {
    const { records } = req.body;

    if (!Array.isArray(records) || records.length === 0) {
      return res.status(400).json({
        success: false,
        message: 'Request body must contain a non-empty "records" array'
      });
    }

    // Validate each record has required fields and auto-calculate priceUsd
    const currencyService = getCurrencyService();
    for (let i = 0; i < records.length; i++) {
      const r = records[i];
      if (!r.figureId || !r.site || !r.sourceUrl || r.price == null || !r.currency) {
        return res.status(400).json({
          success: false,
          message: `Record at index ${i} missing required fields: figureId, site, sourceUrl, price, currency`
        });
      }

      // Auto-calculate priceUsd if not provided
      if (r.priceUsd == null) {
        try {
          r.priceUsd = currencyService.convertToUsd(r.price, r.currency);
        } catch (err: any) {
          return res.status(400).json({
            success: false,
            message: `Record at index ${i}: Cannot auto-convert currency ${r.currency} to USD: ${err.message}. Provide priceUsd explicitly.`
          });
        }
      }
    }

    // Set defaults for each record
    const preparedRecords = records.map((r: any) => ({
      ...r,
      stockStatus: r.stockStatus || 'unknown',
      isResale: r.isResale || false,
      observedAt: r.observedAt || new Date()
    }));

    const savedRecords = await PriceRecord.insertMany(preparedRecords);

    return res.status(201).json({
      success: true,
      count: savedRecords.length,
      data: savedRecords
    });
  } catch (error: any) {
    logger.error('Error recording price batch:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while recording price batch'
    });
  }
};

// ─── Price Stats ─────────────────────────────────────────────────────────────

/**
 * GET /prices/stats
 * Aggregate price stats (avg price, price distribution, etc.)
 * Query params: ?figureId=xxx&site=akimomo
 */
export const getPriceStats = async (req: Request, res: Response) => {
  try {
    const figureId = req.query.figureId as string | undefined;
    const site = req.query.site as string | undefined;

    const matchStage: Record<string, any> = {};
    if (figureId) {
      if (!mongoose.Types.ObjectId.isValid(figureId)) {
        return res.status(422).json({
          success: false,
          message: 'Validation Error',
          errors: [{ message: 'Invalid figureId format', path: ['figureId'] }]
        });
      }
      matchStage.figureId = new mongoose.Types.ObjectId(figureId);
    }
    if (site) {
      matchStage.site = site;
    }

    const pipeline: mongoose.PipelineStage[] = [];
    if (Object.keys(matchStage).length > 0) {
      pipeline.push({ $match: matchStage });
    }

    pipeline.push({
      $group: {
        _id: '$site',
        avgPriceUsd: { $avg: '$priceUsd' },
        minPriceUsd: { $min: '$priceUsd' },
        maxPriceUsd: { $max: '$priceUsd' },
        totalRecords: { $sum: 1 },
        latestObservation: { $max: '$observedAt' }
      }
    });

    pipeline.push({ $sort: { _id: 1 } });

    const stats = await PriceRecord.aggregate(pipeline);

    return res.status(200).json({
      success: true,
      data: stats
    });
  } catch (error: any) {
    logger.error('Error fetching price stats:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching price stats'
    });
  }
};

// ─── Watchlist ───────────────────────────────────────────────────────────────

/**
 * GET /prices/watchlist
 * Get the authenticated user's price watchlist.
 */
export const getWatchlist = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const pageParam = req.query.page as string;
    const page = parseInt(pageParam, 10) || 1;
    const limitParam = req.query.limit as string;
    const limit = parseInt(limitParam, 10) || 20;
    const skip = (page - 1) * limit;

    const userId = req.user.id;

    const total = await PriceWatchlist.countDocuments({ userId });
    const pages = Math.ceil(total / limit);

    const items = await PriceWatchlist.find({ userId })
      .sort({ addedAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('figureId', 'name manufacturer imageUrl')
      .lean();

    return res.status(200).json({
      success: true,
      count: items.length,
      page,
      pages,
      total,
      data: items
    });
  } catch (error: any) {
    logger.error('Error fetching watchlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching watchlist'
    });
  }
};

/**
 * POST /prices/watchlist/:figureId
 * Add a figure to the user's price watchlist.
 */
export const addToWatchlist = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { figureId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(figureId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid figureId format', path: ['figureId'] }]
      });
    }

    const userId = req.user.id;
    const trackedSites = req.body.trackedSites || [];

    // Check if already on watchlist
    const existing = await PriceWatchlist.findOne({ userId, figureId });
    if (existing) {
      return res.status(409).json({
        success: false,
        message: 'Figure is already on your watchlist'
      });
    }

    const item = new PriceWatchlist({
      userId,
      figureId,
      trackedSites,
      addedAt: new Date()
    });

    const savedItem = await item.save();

    return res.status(201).json({
      success: true,
      data: savedItem
    });
  } catch (error: any) {
    logger.error('Error adding to watchlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while adding to watchlist'
    });
  }
};

/**
 * DELETE /prices/watchlist/:figureId
 * Remove a figure from the user's price watchlist.
 */
export const removeFromWatchlist = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { figureId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(figureId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid figureId format', path: ['figureId'] }]
      });
    }

    const userId = req.user.id;

    const deleted = await PriceWatchlist.findOneAndDelete({ userId, figureId });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Figure not found on watchlist'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Removed from watchlist'
    });
  } catch (error: any) {
    logger.error('Error removing from watchlist:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while removing from watchlist'
    });
  }
};

// ─── Price Alerts ────────────────────────────────────────────────────────────

/**
 * GET /prices/alerts
 * Get the authenticated user's price alerts.
 */
export const getAlerts = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const userId = req.user.id;

    const alerts = await PriceAlert.find({ userId })
      .sort({ createdAt: -1 })
      .populate('figureId', 'name manufacturer imageUrl')
      .lean();

    return res.status(200).json({
      success: true,
      count: alerts.length,
      data: alerts
    });
  } catch (error: any) {
    logger.error('Error fetching alerts:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while fetching alerts'
    });
  }
};

/**
 * POST /prices/alerts
 * Create a new price alert.
 */
export const createAlert = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const userId = req.user.id;
    const { figureId, type, targetPrice, targetCurrency, sites, notifyVia } = req.body;

    if (!figureId || !type) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields: figureId, type'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(figureId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid figureId format', path: ['figureId'] }]
      });
    }

    const alert = new PriceAlert({
      userId,
      figureId,
      type,
      targetPrice,
      targetCurrency,
      sites: sites || [],
      notifyVia: notifyVia || ['push'],
      active: true,
      triggerCount: 0
    });

    const savedAlert = await alert.save();

    return res.status(201).json({
      success: true,
      data: savedAlert
    });
  } catch (error: any) {
    logger.error('Error creating alert:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while creating alert'
    });
  }
};

/**
 * PUT /prices/alerts/:alertId
 * Update an existing price alert (e.g., change threshold, toggle active).
 */
export const updateAlert = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { alertId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid alertId format', path: ['alertId'] }]
      });
    }

    const alert = await PriceAlert.findOne({ _id: alertId, userId });
    if (!alert) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    // Update allowed fields
    const allowedFields = ['type', 'targetPrice', 'targetCurrency', 'sites', 'active', 'notifyVia'];
    for (const field of allowedFields) {
      if (req.body[field] !== undefined) {
        (alert as any)[field] = req.body[field];
      }
    }

    const updatedAlert = await alert.save();

    return res.status(200).json({
      success: true,
      data: updatedAlert
    });
  } catch (error: any) {
    logger.error('Error updating alert:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while updating alert'
    });
  }
};

/**
 * DELETE /prices/alerts/:alertId
 * Delete a price alert.
 */
export const deleteAlert = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: 'User not authenticated' });
    }

    const { alertId } = req.params;
    const userId = req.user.id;

    if (!mongoose.Types.ObjectId.isValid(alertId)) {
      return res.status(422).json({
        success: false,
        message: 'Validation Error',
        errors: [{ message: 'Invalid alertId format', path: ['alertId'] }]
      });
    }

    const deleted = await PriceAlert.findOneAndDelete({ _id: alertId, userId });
    if (!deleted) {
      return res.status(404).json({
        success: false,
        message: 'Alert not found'
      });
    }

    return res.status(200).json({
      success: true,
      message: 'Alert deleted'
    });
  } catch (error: any) {
    logger.error('Error deleting alert:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: 'An unexpected error occurred while deleting alert'
    });
  }
};
