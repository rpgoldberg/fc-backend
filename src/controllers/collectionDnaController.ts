import { Request, Response } from 'express';
import collectionDnaService from '../services/collectionDnaService';
import { createLogger } from '../utils/logger';

const logger = createLogger('COLLECTION_DNA');

/**
 * GET /analytics/collection/dna
 * Returns the authenticated user's Collection DNA profile.
 */
export const getCollectionDna = async (req: Request, res: Response) => {
  try {
    if (!req.user) {
      return res.status(401).json({
        success: false,
        message: 'User not authenticated',
      });
    }

    const dna = await collectionDnaService.analyze(req.user.id);

    // Prevent caching — DNA changes as collection evolves
    res.setHeader('Cache-Control', 'no-cache, no-store, must-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');

    return res.status(200).json({
      success: true,
      data: dna,
    });
  } catch (error: any) {
    logger.error('Failed to generate Collection DNA:', error);
    return res.status(500).json({
      success: false,
      message: 'Server Error',
      error: error.message,
    });
  }
};
