import { Request, Response } from 'express';
import mongoose from 'mongoose';
import DuplicateDismissal from '../models/DuplicateDismissal';
import { detectDuplicates, mergeFigures } from '../services/duplicateDetector';
import { createLogger } from '../utils/logger';

const logger = createLogger('DUPLICATE');

/**
 * GET /figures/duplicates
 * Scan the authenticated user's collection for potential duplicate figures.
 */
export const getDuplicates = async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const candidates = await detectDuplicates(userId);

    return res.status(200).json({
      success: true,
      count: candidates.length,
      data: candidates
    });
  } catch (error: any) {
    logger.error('Error detecting duplicates:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to detect duplicates'
    });
  }
};

/**
 * POST /figures/duplicates/dismiss
 * Dismiss a duplicate pair so it will not appear in future scans.
 * Body: { figureAId: string, figureBId: string }
 */
export const dismissDuplicate = async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const { figureAId, figureBId } = req.body;

    if (!figureAId || !figureBId) {
      return res.status(400).json({
        success: false,
        message: 'Both figureAId and figureBId are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(figureAId) || !mongoose.Types.ObjectId.isValid(figureBId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid figure ID format'
      });
    }

    if (figureAId === figureBId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot dismiss a figure as duplicate of itself'
      });
    }

    // Normalize order so the same pair always stores consistently
    const [normalizedA, normalizedB] = figureAId < figureBId
      ? [figureAId, figureBId]
      : [figureBId, figureAId];

    // Upsert to avoid duplicate dismissal records
    await DuplicateDismissal.findOneAndUpdate(
      { userId, figureAId: normalizedA, figureBId: normalizedB },
      { userId, figureAId: normalizedA, figureBId: normalizedB, dismissedAt: new Date() },
      { upsert: true, new: true }
    );

    return res.status(200).json({
      success: true,
      message: 'Duplicate pair dismissed'
    });
  } catch (error: any) {
    logger.error('Error dismissing duplicate:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to dismiss duplicate'
    });
  }
};

/**
 * POST /figures/duplicates/merge
 * Merge two figures: keep the target, delete the source, combine data.
 * Body: { targetId: string, sourceId: string }
 */
export const mergeDuplicates = async (req: Request, res: Response): Promise<void | Response> => {
  try {
    const userId = req.user?.id;
    if (!userId) {
      return res.status(401).json({ success: false, message: 'Not authorized' });
    }

    const { targetId, sourceId } = req.body;

    if (!targetId || !sourceId) {
      return res.status(400).json({
        success: false,
        message: 'Both targetId and sourceId are required'
      });
    }

    if (!mongoose.Types.ObjectId.isValid(targetId) || !mongoose.Types.ObjectId.isValid(sourceId)) {
      return res.status(400).json({
        success: false,
        message: 'Invalid figure ID format'
      });
    }

    if (targetId === sourceId) {
      return res.status(400).json({
        success: false,
        message: 'Cannot merge a figure with itself'
      });
    }

    const merged = await mergeFigures(userId, targetId, sourceId);

    return res.status(200).json({
      success: true,
      message: 'Figures merged successfully',
      data: merged
    });
  } catch (error: any) {
    if (error.message === 'Target figure not found' || error.message === 'Source figure not found') {
      return res.status(404).json({
        success: false,
        message: error.message
      });
    }
    logger.error('Error merging duplicates:', error);
    return res.status(500).json({
      success: false,
      message: 'Failed to merge figures'
    });
  }
};
