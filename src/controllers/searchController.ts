import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { figureSearch, publicSearch } from '../services/search';
import { createLogger } from '../utils/logger';

const logger = createLogger('SEARCH');

/**
 * Search figures for authenticated users.
 * Delegates to figureSearch which handles Atlas Search vs regex fallback.
 */
export const searchFigures = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }
    const userId = req.user.id;
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    let userObjectId: mongoose.Types.ObjectId;
    try {
      userObjectId = new mongoose.Types.ObjectId(userId);
    } catch (error: any) {
      logger.error('Invalid userId for ObjectId conversion:', error.message);
      return res.status(400).json({
        success: false,
        message: 'Invalid user identifier',
      });
    }

    const searchResults = await figureSearch(query as string, userObjectId);

    const hits = searchResults.map(doc => ({
      id: doc._id,
      manufacturer: doc.manufacturer,
      name: doc.name,
      scale: doc.scale,
      mfcLink: doc.mfcLink,
      imageUrl: doc.imageUrl,
      origin: doc.origin,
      category: doc.category,
      tags: doc.tags,
      companyRoles: doc.companyRoles,
      artistRoles: doc.artistRoles,
      userId: doc.userId,
      searchScore: doc.searchScore,
    }));

    return res.status(200).json({
      success: true,
      count: hits.length,
      data: hits,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};

/**
 * Public search endpoint - no authentication required.
 * Omits userId from results for privacy.
 */
export const publicSearchFigures = async (req: Request, res: Response) => {
  try {
    const { query } = req.query;

    if (!query) {
      return res.status(400).json({
        success: false,
        message: 'Search query is required',
      });
    }

    const searchResults = await publicSearch(query as string);

    const hits = searchResults.map(doc => ({
      id: doc._id,
      manufacturer: doc.manufacturer,
      name: doc.name,
      scale: doc.scale,
      mfcLink: doc.mfcLink,
      imageUrl: doc.imageUrl,
      origin: doc.origin,
      category: doc.category,
      tags: doc.tags,
      companyRoles: doc.companyRoles,
      artistRoles: doc.artistRoles,
      searchScore: doc.searchScore,
    }));

    return res.status(200).json({
      success: true,
      count: hits.length,
      data: hits,
    });
  } catch (error: any) {
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};
