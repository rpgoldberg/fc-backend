import { Request, Response } from 'express';
import mongoose from 'mongoose';
import { wordWheelSearch, partialSearch } from '../services/searchService';

/**
 * Validates search query parameter
 * @returns Error response object if invalid, null if valid
 */
const validateQuery = (query: string): { status: number; json: object } | null => {
  if (!query) {
    return {
      status: 400,
      json: {
        success: false,
        message: 'Query parameter is required'
      }
    };
  }

  if (query.trim().length < 2) {
    return {
      status: 400,
      json: {
        success: false,
        message: 'Query must be at least 2 characters'
      }
    };
  }

  return null;
};

/**
 * Validates and parses limit parameter
 * @returns Parsed limit value (capped at 50) or error response
 */
const validateLimit = (limitParam?: string): number | { status: number; json: object } => {
  if (!limitParam) {
    return 10; // default
  }

  const parsedLimit = parseInt(limitParam, 10);
  if (isNaN(parsedLimit) || parsedLimit <= 0) {
    return {
      status: 400,
      json: {
        success: false,
        message: 'Limit must be a positive integer'
      }
    };
  }

  return Math.min(parsedLimit, 50);
};

/**
 * Get autocomplete suggestions for word wheel search
 * GET /api/search/suggestions?q=<query>&limit=<number>
 */
export const getSuggestions = async (req: Request, res: Response) => {
  try {
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user.id);
    const query = req.query.q as string;
    const limitParam = req.query.limit as string;

    // Validate query parameter
    const queryValidation = validateQuery(query);
    if (queryValidation) {
      return res.status(queryValidation.status).json(queryValidation.json);
    }

    // Validate and parse limit
    const limit = validateLimit(limitParam);
    if (typeof limit === 'object') {
      return res.status(limit.status).json(limit.json);
    }

    // Call search service
    const results = await wordWheelSearch(query, userId, limit);

    return res.status(200).json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error: any) {
    console.error('[SEARCH CONTROLLER] Error in getSuggestions:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching search suggestions'
    });
  }
};

/**
 * Validates and parses offset parameter
 * @returns Parsed offset value or error response
 */
const validateOffset = (offsetParam?: string): number | { status: number; json: object } => {
  if (!offsetParam) {
    return 0; // default
  }

  const parsedOffset = parseInt(offsetParam, 10);
  if (isNaN(parsedOffset) || parsedOffset < 0) {
    return {
      status: 400,
      json: {
        success: false,
        message: 'Offset must be a non-negative integer'
      }
    };
  }

  return parsedOffset;
};

/**
 * Get partial word matches
 * GET /api/search/partial?q=<query>&limit=<number>&offset=<number>
 */
export const getPartialMatches = async (req: Request, res: Response) => {
  try {
    // Check authentication
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated'
      });
    }

    const userId = new mongoose.Types.ObjectId(req.user.id);
    const query = req.query.q as string;
    const limitParam = req.query.limit as string;
    const offsetParam = req.query.offset as string;

    // Validate query parameter
    const queryValidation = validateQuery(query);
    if (queryValidation) {
      return res.status(queryValidation.status).json(queryValidation.json);
    }

    // Validate and parse limit
    const limit = validateLimit(limitParam);
    if (typeof limit === 'object') {
      return res.status(limit.status).json(limit.json);
    }

    // Validate and parse offset
    const offset = validateOffset(offsetParam);
    if (typeof offset === 'object') {
      return res.status(offset.status).json(offset.json);
    }

    // Call search service
    const results = await partialSearch(query, userId, { limit, offset });

    return res.status(200).json({
      success: true,
      data: results,
      count: results.length
    });
  } catch (error: any) {
    console.error('[SEARCH CONTROLLER] Error in getPartialMatches:', error);
    return res.status(500).json({
      success: false,
      message: 'An error occurred while fetching partial matches'
    });
  }
};
